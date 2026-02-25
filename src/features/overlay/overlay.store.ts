// Overlay state management
import { writable, derived, get } from 'svelte/store';
import type { Bookmark, HistoryEntry, OverlayMode, Settings } from '../../shared/types';
import { bookmarkStore, navigateToItem, updateTenantMapping } from '../bookmarks/bookmarks.store';
import { settingsStore } from '../settings/settings.store';
import { historyStore } from '../history/history.store';
import { getCurrentDirectoryInfo, getGuidForDomain } from '../bookmarks/url-parser';
import { storageSyncGet, storageSyncSet } from '../../shared/storage';
import { MAX_ITEMS } from '../../shared/constants';

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

// Store for inline error messages (e.g. bookmark limit reached). Auto-clears after 4s.
export const overlayError = writable<string | null>(null);

let _errorTimer: ReturnType<typeof setTimeout> | null = null;

function setOverlayError(message: string): void {
  overlayError.set(message);
  if (_errorTimer) clearTimeout(_errorTimer);
  _errorTimer = setTimeout(() => overlayError.set(null), 4000);
}

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
    const dirInfo = getCurrentDirectoryInfo();
    currentDirectory.set(dirInfo);

    // Passively cache current directory's domain → GUID mapping.
    // Uses MSAL token scanning (domain-aware) instead of window.Portal.tenant.id
    // which returns stale GUIDs after directory switches.
    if (dirInfo.domain) {
      const msalGuid = getGuidForDomain(dirInfo.domain);
      if (msalGuid) {
        updateTenantMapping(msalGuid, dirInfo.domain);
      }
    }
    try {
      const [bookmarkData, settingsData, tenantAliasData] = await Promise.all([
        bookmarkStore.getAll(),
        settingsStore.get(),
        storageSyncGet('tenantAliases'),
      ]);

      bookmarks.set(bookmarkData);
      settings.set(settingsData);
      tenantAliases.set(tenantAliasData || {});

      // Also refresh history if available (use settings for limit)
      try {
        const limit = settingsData.historyMaxEntries || 500;
        const historyData = await historyStore.getRecent(limit);
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
      await navigateToItem(item.url, item.tenantId, item.tenantName);
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
      return;
    }

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
    const result = await bookmarkStore.saveCurrentPage({ alias });
    if (!result.success) {
      if (result.reason === 'limit_reached') {
        setOverlayError(
          `Bookmark limit reached (${MAX_ITEMS.BOOKMARKS}/${MAX_ITEMS.BOOKMARKS}) — remove bookmarks to add more.`
        );
      }
      return;
    }
    await this.refresh();
  },

  /**
   * Convert a history item to a bookmark
   */
  async saveHistoryItem(historyEntry: HistoryEntry) {
    const bookmark: Bookmark = {
      id: crypto.randomUUID(),
      url: historyEntry.url,
      tenantId: historyEntry.tenantId,
      tenantName: historyEntry.tenantName,
      resourceId: historyEntry.resourceId,
      displayName: historyEntry.displayName,
      alias: null,
      stateDepth: 'full',
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 0,
      isStale: false,
    };

    const result = await bookmarkStore.save(bookmark);
    if (!result.success) {
      if (result.reason === 'limit_reached') {
        setOverlayError(
          `Bookmark limit reached (${MAX_ITEMS.BOOKMARKS}/${MAX_ITEMS.BOOKMARKS}) — remove bookmarks to add more.`
        );
      }
      return;
    }
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
