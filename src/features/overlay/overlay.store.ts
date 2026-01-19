// Overlay state management
import { writable, derived, get } from 'svelte/store';
import type { Bookmark, HistoryEntry, OverlayMode, Settings } from '../../shared/types';
import { bookmarkStore, lookupTenantGuid } from '../bookmarks/bookmarks.store';
import { settingsStore } from '../settings/settings.store';
import { historyStore } from '../history/history.store';
import {
  getCurrentDirectoryInfo,
  isSameDirectory,
  buildNavigationUrl,
} from '../bookmarks/url-parser';

// Store for overlay visibility
export const isOverlayOpen = writable(false);

// Store for current mode
export const overlayMode = writable<OverlayMode>('navigate');

// Store for selected item index
export const selectedIndex = writable(0);

// Store for search query
export const searchQuery = writable('');

// Store for bookmarks
export const bookmarks = writable<Bookmark[]>([]);

// Store for history
export const history = writable<HistoryEntry[]>([]);

// Store for settings
export const settings = writable<Settings | null>(null);

// Combined items for display
export type DisplayItem = (Bookmark | HistoryEntry) & { type: 'bookmark' | 'history' };

// Derived store for filtered items based on search
export const filteredItems = derived(
  [bookmarks, history, searchQuery, overlayMode],
  ([$bookmarks, $history, $searchQuery, $mode]) => {
    let items: DisplayItem[] = [];

    // Track seen resources to deduplicate (resourceId:tenantId)
    const seen = new Set<string>();

    // Add bookmarks first (they take priority over history)
    for (const b of $bookmarks) {
      const key = `${b.resourceId}:${b.tenantId}`;
      if (!seen.has(key)) {
        seen.add(key);
        items.push({ ...b, type: 'bookmark' as const });
      }
    }

    // Add history if in navigate mode (skip if already bookmarked)
    if ($mode === 'navigate') {
      for (const h of $history) {
        const key = `${h.resourceId}:${h.tenantId}`;
        if (!seen.has(key)) {
          seen.add(key);
          items.push({ ...h, type: 'history' as const });
        }
      }
    }

    // Filter by search query
    if ($searchQuery.trim()) {
      const query = $searchQuery.toLowerCase();
      items = items.filter((item) => {
        const searchText = [
          item.displayName,
          'alias' in item ? item.alias : null,
          item.tenantName,
          item.resourceId,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return searchText.includes(query);
      });
    }

    // Sort items to match visual display order (grouped by tenant)
    // This ensures arrow key navigation follows the visual order
    const tenantOrder = new Map<string, number>();
    let orderIndex = 0;
    for (const item of items) {
      const tenantKey = item.tenantName || item.tenantId;
      if (!tenantOrder.has(tenantKey)) {
        tenantOrder.set(tenantKey, orderIndex++);
      }
    }

    items.sort((a, b) => {
      const tenantA = a.tenantName || a.tenantId;
      const tenantB = b.tenantName || b.tenantId;
      const orderA = tenantOrder.get(tenantA) ?? 0;
      const orderB = tenantOrder.get(tenantB) ?? 0;
      return orderA - orderB;
    });

    return items;
  }
);

// Derived store for items grouped by tenant (group by tenantName for display, not tenantId)
export const itemsByTenant = derived(filteredItems, ($items) => {
  const grouped = new Map<string, { tenantName: string; items: DisplayItem[] }>();

  for (const item of $items) {
    // Group by tenantName (domain) for display purposes
    // tenantId may be a GUID (for navigation) which would create separate groups for same tenant
    const key = item.tenantName || item.tenantId;
    if (!grouped.has(key)) {
      grouped.set(key, {
        tenantName: item.tenantName,
        items: [],
      });
    }
    grouped.get(key)!.items.push(item);
  }

  return grouped;
});

// Actions
export const overlayActions = {
  /**
   * Toggle overlay visibility
   */
  toggle() {
    isOverlayOpen.update((v) => !v);
    if (get(isOverlayOpen)) {
      this.refresh();
    }
  },

  /**
   * Open overlay
   */
  open() {
    isOverlayOpen.set(true);
    this.refresh();
  },

  /**
   * Close overlay
   */
  close() {
    isOverlayOpen.set(false);
    searchQuery.set('');
    selectedIndex.set(0);
    overlayMode.set('navigate');
  },

  /**
   * Refresh data from storage
   */
  async refresh() {
    try {
      const [bookmarkData, settingsData] = await Promise.all([
        bookmarkStore.getAll(),
        settingsStore.get(),
      ]);

      console.log('[BetterPortal] Loaded', bookmarkData.length, 'bookmarks');
      bookmarks.set(bookmarkData);
      settings.set(settingsData);

      // Also refresh history if available (use settings for limit)
      try {
        const limit = settingsData.historyMaxEntries || 500;
        const historyData = await historyStore.getRecent(limit);
        console.log('[BetterPortal] Loaded', historyData.length, 'history items (limit:', limit, ')');
        history.set(historyData);
      } catch {
        // History store may not be loaded yet
      }
    } catch (e: any) {
      // Check for extension context invalidated
      if (e?.message?.includes('Extension') || e?.message?.includes('context')) {
        console.warn('[BetterPortal] Extension updated - please refresh the page');
        // Close overlay and alert user
        isOverlayOpen.set(false);
        alert('BetterPortal extension was updated. Please refresh the page to continue.');
      } else {
        console.error('[BetterPortal] Error refreshing data:', e);
      }
    }
  },

  /**
   * Move selection up
   */
  moveUp() {
    const items = get(filteredItems);
    selectedIndex.update((i) => (i > 0 ? i - 1 : items.length - 1));
  },

  /**
   * Move selection down
   */
  moveDown() {
    const items = get(filteredItems);
    selectedIndex.update((i) => (i < items.length - 1 ? i + 1 : 0));
  },

  /**
   * Select current item
   */
  async selectCurrent() {
    const items = get(filteredItems);
    const index = get(selectedIndex);
    const item = items[index];

    if (!item) return;

    if (item.type === 'bookmark') {
      await bookmarkStore.navigate(item.id);
    } else {
      // Navigate to history item - check for directory switching
      let navigationUrl = item.url;

      // Check if we're navigating to a different directory
      const currentDir = getCurrentDirectoryInfo();
      const itemDomain = item.tenantName?.toLowerCase() || null;
      const sameDirectory = isSameDirectory(currentDir.domain, itemDomain);

      // Get tenant GUID - prefer stored tenantId, fallback to cached mapping
      let tenantGuid = item.tenantId;
      if (!tenantGuid && itemDomain) {
        tenantGuid = await lookupTenantGuid(itemDomain);
      }

      if (!sameDirectory && tenantGuid) {
        // Different directory - inject GUID into URL path for cross-tenant navigation
        navigationUrl = buildNavigationUrl(item.url, tenantGuid);
      }

      window.location.href = navigationUrl;
    }

    this.close();
  },

  /**
   * Delete selected item
   */
  async deleteSelected() {
    const items = get(filteredItems);
    const index = get(selectedIndex);
    const item = items[index];

    if (!item) {
      console.log('[BetterPortal] No item selected to delete');
      return;
    }

    console.log('[BetterPortal] Deleting item:', item.type, item.displayName);

    if (item.type === 'bookmark') {
      // Delete bookmark AND corresponding history entry (so it doesn't reappear as history)
      await bookmarkStore.delete(item.id);
      await historyStore.deleteByResource(item.resourceId, item.tenantId);
    } else if (item.type === 'history') {
      await historyStore.delete(item.id);
    }

    await this.refresh();

    // Adjust selectedIndex if we deleted the last item
    const newItems = get(filteredItems);
    if (index >= newItems.length && newItems.length > 0) {
      selectedIndex.set(newItems.length - 1);
    } else if (newItems.length === 0) {
      selectedIndex.set(0);
    }
  },

  /**
   * Save current page as bookmark
   */
  async saveCurrentPage(alias?: string) {
    await bookmarkStore.saveCurrentPage({ alias });
    await this.refresh();
  },

  /**
   * Set search query
   */
  setSearch(query: string) {
    searchQuery.set(query);
    selectedIndex.set(0);
  },

  /**
   * Switch mode
   */
  setMode(mode: OverlayMode) {
    overlayMode.set(mode);
    selectedIndex.set(0);
  },
};
