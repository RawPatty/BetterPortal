// Overlay state management
import { writable, derived, get } from 'svelte/store';
import type { Bookmark, HistoryEntry, OverlayMode, Settings } from '../../shared/types';
import { bookmarkStore } from '../bookmarks/bookmarks.store';
import { settingsStore } from '../settings/settings.store';

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

    // Add bookmarks
    items.push(...$bookmarks.map((b) => ({ ...b, type: 'bookmark' as const })));

    // Add history if in navigate mode
    if ($mode === 'navigate') {
      items.push(...$history.map((h) => ({ ...h, type: 'history' as const })));
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

    return items;
  }
);

// Derived store for items grouped by tenant
export const itemsByTenant = derived(filteredItems, ($items) => {
  const grouped = new Map<string, { tenantName: string; items: DisplayItem[] }>();

  for (const item of $items) {
    const key = item.tenantId;
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
    const [bookmarkData, settingsData] = await Promise.all([
      bookmarkStore.getAll(),
      settingsStore.get(),
    ]);

    bookmarks.set(bookmarkData);
    settings.set(settingsData);

    // Also refresh history if available
    try {
      const { historyStore } = await import('../history/history.store');
      const historyData = await historyStore.getRecent(20);
      history.set(historyData);
    } catch {
      // History store may not be loaded yet
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
      // Navigate to history item
      window.location.href = item.url;
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

    if (!item) return;

    if (item.type === 'bookmark') {
      await bookmarkStore.delete(item.id);
      await this.refresh();
    }
    // History items can't be individually deleted in this implementation
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
