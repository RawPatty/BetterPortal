// History store for BetterPortal
import { storageGet, storageSet } from '../../shared/storage';
import type { HistoryEntry, Settings } from '../../shared/types';
import { parsePortalUrl, generateDisplayName, getTenantNameFromDOM } from '../bookmarks/url-parser';
import { settingsStore } from '../settings/settings.store';
import { MAX_ITEMS } from '../../shared/constants';

export const historyStore = {
  /**
   * Get all history entries
   */
  async getAll(): Promise<HistoryEntry[]> {
    const history = await storageGet('history');
    return history || [];
  },

  /**
   * Get recent history entries
   */
  async getRecent(limit: number = 20): Promise<HistoryEntry[]> {
    const all = await this.getAll();
    return all
      .sort((a, b) => b.visitedAt - a.visitedAt)
      .slice(0, limit);
  },

  /**
   * Get history entry by ID
   */
  async get(id: string): Promise<HistoryEntry | null> {
    const all = await this.getAll();
    return all.find((h) => h.id === id) || null;
  },

  /**
   * Add or update history entry
   */
  async upsert(url: string): Promise<HistoryEntry | null> {
    const settings = await settingsStore.get();

    // Check if history is enabled
    if (!settings.historyEnabled) {
      return null;
    }

    const parsed = parsePortalUrl(url);

    // Only track resource pages
    if (!parsed.resourceId) {
      return null;
    }

    const all = await this.getAll();

    // Check if entry already exists
    const existingIndex = all.findIndex(
      (h) => h.resourceId === parsed.resourceId && h.tenantId === parsed.tenantId
    );

    if (existingIndex >= 0) {
      // Update existing entry
      all[existingIndex] = {
        ...all[existingIndex],
        url,
        visitedAt: Date.now(),
        visitCount: all[existingIndex].visitCount + 1,
      };
      await storageSet('history', all);
      return all[existingIndex];
    }

    // Create new entry
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      url,
      tenantId: parsed.tenantId || 'unknown',
      tenantName: getTenantNameFromDOM() || parsed.tenantDomain || 'Unknown Tenant',
      resourceId: parsed.resourceId,
      displayName: generateDisplayName(parsed.resourceId, parsed.blade),
      visitedAt: Date.now(),
      visitCount: 1,
    };

    all.push(entry);

    // Prune if over limit
    await this.prune(all, settings);

    await storageSet('history', all);
    return entry;
  },

  /**
   * Prune old entries based on settings
   */
  async prune(entries: HistoryEntry[], settings?: Settings): Promise<HistoryEntry[]> {
    if (!settings) {
      settings = await settingsStore.get();
    }

    const now = Date.now();
    const retentionMs = settings.historyRetentionDays * 24 * 60 * 60 * 1000;
    const maxEntries = settings.historyMaxEntries || MAX_ITEMS.HISTORY;

    // Remove old entries
    let pruned = entries.filter((e) => now - e.visitedAt < retentionMs);

    // Sort by visitedAt descending and trim to max
    pruned.sort((a, b) => b.visitedAt - a.visitedAt);
    if (pruned.length > maxEntries) {
      pruned = pruned.slice(0, maxEntries);
    }

    return pruned;
  },

  /**
   * Clear all history
   */
  async clear(): Promise<void> {
    await storageSet('history', []);
  },

  /**
   * Delete a specific entry
   */
  async delete(id: string): Promise<boolean> {
    const all = await this.getAll();
    const filtered = all.filter((h) => h.id !== id);

    if (filtered.length === all.length) {
      return false;
    }

    await storageSet('history', filtered);
    return true;
  },

  /**
   * Search history
   */
  async search(query: string): Promise<HistoryEntry[]> {
    if (!query.trim()) {
      return this.getRecent(50);
    }

    const all = await this.getAll();
    const lowerQuery = query.toLowerCase();

    return all
      .filter((entry) => {
        const searchText = [
          entry.displayName,
          entry.tenantName,
          entry.resourceId,
        ]
          .join(' ')
          .toLowerCase();

        return searchText.includes(lowerQuery);
      })
      .sort((a, b) => b.visitedAt - a.visitedAt);
  },
};
