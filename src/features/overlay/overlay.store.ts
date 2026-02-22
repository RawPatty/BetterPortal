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
import { storageSyncGet, storageSyncSet } from '../../shared/storage';

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

// Store for tenant aliases (tenantName domain → user alias)
export const tenantAliases = writable<Record<string, string>>({});

// Store for the current Azure Portal directory (populated on each refresh)
export const currentDirectory = writable<{ domain: string | null; guid: string | null }>({ domain: null, guid: null });

// Derived store: current directory with alias resolved from tenantAliases
export const currentDirectoryDisplay = derived(
  [currentDirectory, tenantAliases],
  ([$currentDirectory, $tenantAliases]) => ({
    domain: $currentDirectory.domain,
    alias: $currentDirectory.domain ? ($tenantAliases[$currentDirectory.domain] ?? null) : null,
  })
);

// Combined items for display
export type DisplayItem = (Bookmark | HistoryEntry) & { type: 'bookmark' | 'history' };

// Derived store for filtered items based on search
export const filteredItems = derived(
  [bookmarks, history, searchQuery, overlayMode, tenantAliases, currentDirectory],
  ([$bookmarks, $history, $searchQuery, $mode, $tenantAliases, $currentDirectory]) => {
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
        const tenantKey = item.tenantName || item.tenantId;
        const tenantAlias = tenantKey ? $tenantAliases[tenantKey] : null;
        const searchText = [
          item.displayName,
          'alias' in item ? item.alias : null,
          item.tenantName,
          tenantAlias,
          item.resourceId,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return searchText.includes(query);
      });
    }

    // Sort items to match visual display order (grouped by tenant, current directory first)
    // This ensures arrow key navigation follows the visual order shown in itemsByTenant
    const currentDomain = $currentDirectory.domain?.toLowerCase() ?? null;

    items.sort((a, b) => {
      const tenantA = (a.tenantName || a.tenantId)?.toLowerCase() ?? '';
      const tenantB = (b.tenantName || b.tenantId)?.toLowerCase() ?? '';
      const isCurrentA = currentDomain !== null && tenantA === currentDomain;
      const isCurrentB = currentDomain !== null && tenantB === currentDomain;
      if (isCurrentA && !isCurrentB) return -1;
      if (isCurrentB && !isCurrentA) return 1;
      // Within the same tenant, preserve original order (stable sort)
      return 0;
    });

    return items;
  }
);

// Derived store for items grouped by tenant (group by tenantName for display, not tenantId)
export const itemsByTenant = derived(
  [filteredItems, tenantAliases, currentDirectory],
  ([$items, $tenantAliases, $currentDirectory]) => {
    const grouped = new Map<string, { tenantName: string; displayName: string; items: DisplayItem[] }>();

    for (const item of $items) {
      // Group by tenantName (domain) for display purposes
      // tenantId may be a GUID (for navigation) which would create separate groups for same tenant
      const key = item.tenantName || item.tenantId;
      if (!grouped.has(key)) {
        grouped.set(key, {
          tenantName: item.tenantName,
          displayName: $tenantAliases[key] || item.tenantName,
          items: [],
        });
      }
      grouped.get(key)!.items.push(item);
    }

    // Sort current directory group to the top
    if ($currentDirectory.domain) {
      const currentDomain = $currentDirectory.domain.toLowerCase();
      const entries = [...grouped.entries()];
      entries.sort(([keyA], [keyB]) => {
        const isCurrentA = keyA?.toLowerCase() === currentDomain;
        const isCurrentB = keyB?.toLowerCase() === currentDomain;
        if (isCurrentA) return -1;
        if (isCurrentB) return 1;
        return 0;
      });
      return new Map(entries);
    }

    return grouped;
  }
);

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
    currentDirectory.set(getCurrentDirectoryInfo());
    try {
      const [bookmarkData, settingsData, tenantAliasData] = await Promise.all([
        bookmarkStore.getAll(),
        settingsStore.get(),
        storageSyncGet('tenantAliases'),
      ]);

      console.log('[BetterPortal] Loaded', bookmarkData.length, 'bookmarks');
      bookmarks.set(bookmarkData);
      settings.set(settingsData);
      tenantAliases.set(tenantAliasData || {});

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
      // Navigate to history item - determine correct tenant GUID to use
      const currentDir = getCurrentDirectoryInfo();
      const itemDomain = item.tenantName?.toLowerCase() || null;
      const sameDirectory = isSameDirectory(currentDir.domain, itemDomain);

      // Get item's tenant GUID - prefer stored tenantId, fallback to cached mapping
      let itemTenantGuid = item.tenantId;
      if (!itemTenantGuid && itemDomain) {
        itemTenantGuid = await lookupTenantGuid(itemDomain);
      }

      // Determine navigation URL based on directory context
      let navigationUrl = item.url;

      if (sameDirectory) {
        // Same directory: use original URL without GUID injection
        // This avoids redirect flash when already in the correct tenant context
        console.log('[BetterPortal] Same directory navigation - using original URL (no redirect)');
      } else {
        // Different directory: inject target GUID for cross-tenant navigation
        if (itemTenantGuid) {
          navigationUrl = buildNavigationUrl(item.url, itemTenantGuid);
          console.log('[BetterPortal] Cross-directory navigation - injecting target GUID:', itemTenantGuid);
        } else {
          console.log('[BetterPortal] Cross-directory navigation requested but no GUID available - using original URL');
        }
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
   * Convert a history item to a bookmark
   */
  async saveHistoryItem(historyEntry: HistoryEntry) {
    // Convert history entry to bookmark format
    const bookmark: Bookmark = {
      id: crypto.randomUUID(),
      url: historyEntry.url,
      tenantId: historyEntry.tenantId,
      tenantName: historyEntry.tenantName,
      resourceId: historyEntry.resourceId,
      displayName: historyEntry.displayName,
      alias: null,
      stateDepth: 'full', // Default to full state for history items
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 0,
      isStale: false,
    };

    // Save the bookmark
    await bookmarkStore.save(bookmark);
    await this.refresh();
  },

  /**
   * Rename a bookmark (set alias)
   */
  async renameBookmark(id: string, alias: string | null) {
    await bookmarkStore.update(id, { alias });
    await this.refresh();
  },

  /**
   * Rename a tenant (set alias for tenant group header)
   */
  async renameTenant(tenantKey: string, alias: string | null) {
    const current = get(tenantAliases);
    const updated = { ...current };
    if (alias) {
      updated[tenantKey] = alias;
    } else {
      delete updated[tenantKey];
    }
    await storageSyncSet('tenantAliases', updated);
    tenantAliases.set(updated);
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
