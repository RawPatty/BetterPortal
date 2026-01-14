// History store for BetterPortal
import { storageGet, storageSet } from '../../shared/storage';
import type { HistoryEntry, Settings } from '../../shared/types';
import { parsePortalUrl, generateDisplayName, getTenantNameFromDOM, getResourceNameFromDOM, extractResourceName } from '../bookmarks/url-parser';
import { settingsStore } from '../settings/settings.store';
import { MAX_ITEMS } from '../../shared/constants';

// Delay before extracting DOM name to allow page to render
const DOM_EXTRACTION_DELAY_MS = 500;

export const historyStore = {
  /**
   * Get all history entries
   */
  async getAll(): Promise<HistoryEntry[]> {
    const history = await storageGet('history');
    return history || [];
  },

  /**
   * Get recent history entries (deduplicated, most recent first)
   */
  async getRecent(limit: number = 20): Promise<HistoryEntry[]> {
    const all = await this.getAll();

    // Deduplicate by resourceId+tenantId, keeping the most recent
    const seen = new Map<string, HistoryEntry>();
    for (const entry of all) {
      const key = `${entry.resourceId}:${entry.tenantId}`;
      const existing = seen.get(key);
      if (!existing || entry.visitedAt > existing.visitedAt) {
        seen.set(key, entry);
      }
    }

    // Sort by visitedAt descending (most recent first)
    return Array.from(seen.values())
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
    try {
      const settings = await settingsStore.get();

      // Check if history is enabled
      if (!settings.historyEnabled) {
        console.log('[BetterPortal] History disabled, skipping capture');
        return null;
      }

      const parsed = parsePortalUrl(url);
      console.log('[BetterPortal] Parsed URL:', { resourceId: parsed.resourceId, tenantId: parsed.tenantId });

      // Only track resource pages
      if (!parsed.resourceId) {
        console.log('[BetterPortal] No resourceId found, skipping');
        return null;
      }

      const all = await this.getAll();
      console.log('[BetterPortal] Current history count:', all.length);

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
        console.log('[BetterPortal] Updated existing history entry');
        return all[existingIndex];
      }

      // Wait for DOM to update before extracting name
      await new Promise(resolve => setTimeout(resolve, DOM_EXTRACTION_DELAY_MS));

      // Get expected resource name from URL
      const urlResourceName = extractResourceName(parsed.resourceId);

      // Try to get DOM name
      const domName = getResourceNameFromDOM();

      // Use DOM name if available and valid, otherwise use URL-extracted name
      let displayName: string;
      if (domName) {
        displayName = domName;
        console.log('[BetterPortal] Using DOM name:', domName);
      } else {
        displayName = urlResourceName;
        console.log('[BetterPortal] Using URL resource name:', urlResourceName);
      }

      // Create new entry
      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        url,
        tenantId: parsed.tenantId || 'unknown',
        tenantName: getTenantNameFromDOM() || parsed.tenantDomain || 'Unknown Tenant',
        resourceId: parsed.resourceId,
        displayName,
        visitedAt: Date.now(),
        visitCount: 1,
      };

      all.push(entry);

      // Prune if over limit - use the pruned result
      const pruned = await this.prune(all, settings);

      await storageSet('history', pruned);
      console.log('[BetterPortal] Added new history entry:', displayName, '(total:', pruned.length, ')');
      return entry;
    } catch (error) {
      console.error('[BetterPortal] Error in history upsert:', error);
      return null;
    }
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
   * Delete a specific entry by ID
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
   * Delete entry by resourceId and tenantId
   */
  async deleteByResource(resourceId: string, tenantId: string): Promise<boolean> {
    const all = await this.getAll();
    const filtered = all.filter(
      (h) => !(h.resourceId === resourceId && h.tenantId === tenantId)
    );

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
