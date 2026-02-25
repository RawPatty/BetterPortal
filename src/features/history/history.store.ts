// History store for BetterPortal
import { storageGet, storageSet } from '../../shared/storage';
import type { HistoryEntry, Settings } from '../../shared/types';
import { parsePortalUrl, getTenantNameFromDOM, getResourceNameFromDOM, extractResourceName, extractDisplayName, stripTenantGuidFromUrl, isErrorPage, getTenantGuidFromPortal } from '../bookmarks/url-parser';
import { updateTenantMapping, lookupTenantGuid } from '../bookmarks/bookmarks.store';
import { settingsStore } from '../settings/settings.store';
import { MAX_ITEMS, GUID_REGEX } from '../../shared/constants';

async function learnTenantMapping(tenantGuid: string, tenantDomain: string): Promise<void> {
  await updateTenantMapping(tenantGuid, tenantDomain);

  // Backfill existing history entries that have null tenantId for this domain.
  // Only update tenantId — never the url field; the GUID is injected at navigation/copy time.
  const history = await storageGet('history');
  if (history) {
    let updated = false;
    for (const entry of history) {
      if (!entry.tenantId && entry.tenantName?.toLowerCase() === tenantDomain.toLowerCase()) {
        entry.tenantId = tenantGuid;
        updated = true;
      }
    }
    if (updated) {
      await storageSet('history', history);
    }
  }
}

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
        return null;
      }

      const parsed = parsePortalUrl(url);

      // Only track resource pages
      if (!parsed.resourceId) {
        return null;
      }

      const all = await this.getAll();

      // Determine tenant ID for navigation (MUST be GUID) and tenant name for grouping
      // tenantId: Used for cross-tenant navigation - MUST be a GUID, null if unavailable
      // tenantName: Used for grouping/display - should be the domain for consistent grouping
      //
      // Strategy: always trust URL path GUID when present (self-heals corrupted caches).
      // Transitional states (A-guid/#@b-domain) are handled by isErrorPage() below.
      // Do NOT fall back to cache lookup — a stale entry would store the wrong GUID.

      const effectiveTenantName = getTenantNameFromDOM() || parsed.tenantDomain || 'Unknown Tenant';

      // Determine effective tenant ID for navigation - MUST be a GUID or null
      let effectiveTenantId: string | null = null;

      if (parsed.tenantId && GUID_REGEX.test(parsed.tenantId)) {
        // URL path GUID is the most reliable source — always trust it and cache the mapping.
        effectiveTenantId = parsed.tenantId;
        if (parsed.tenantDomain) {
          await learnTenantMapping(parsed.tenantId, parsed.tenantDomain);
        }
      } else {
        // URL does not have GUID in path — try live page context only.
        effectiveTenantId = getTenantGuidFromPortal();
        if (effectiveTenantId) {
          const domain = parsed.tenantDomain || effectiveTenantName;
          if (domain && domain !== 'Unknown Tenant') {
            await learnTenantMapping(effectiveTenantId, domain);
          }
        }
        // No cache fallback — a stale/corrupted cache entry would store the wrong GUID.
      }

      // Strip any tenant GUID from the stored URL — the url field should be the canonical
      // resource URL. The GUID is stored separately in tenantId and injected at navigation/copy time.
      const finalUrl = stripTenantGuidFromUrl(url);

      // Check if entry already exists (use tenantName for grouping consistency)
      const existingIndex = all.findIndex(
        (h) => h.resourceId === parsed.resourceId && h.tenantName === effectiveTenantName
      );

      if (existingIndex >= 0) {
        // Update existing entry
        all[existingIndex] = {
          ...all[existingIndex],
          url: finalUrl,
          visitedAt: Date.now(),
          visitCount: all[existingIndex].visitCount + 1,
        };
        await storageSet('history', all);
        return all[existingIndex];
      }

      // Get display name from URL (resource name + sub-path)
      const urlDisplayName = extractDisplayName(parsed.resourceId);
      const urlResourceName = extractResourceName(parsed.resourceId);

      // Wait for DOM to update before extracting name
      await new Promise(resolve => setTimeout(resolve, DOM_EXTRACTION_DELAY_MS));

      // Check if the page is showing an error state (e.g., wrong directory, token issuer mismatch)
      // This happens when switching directories and the portal tries to load the same resource
      if (isErrorPage()) {
        return null;
      }

      // Try to get DOM name for additional context
      const domName = getResourceNameFromDOM();

      // Check if URL resource name looks like a GUID (subscriptions use GUIDs, not friendly names)
      const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(urlResourceName);

      // Use URL-extracted display name as primary (always correct, includes hierarchy)
      // Prefer DOM name when:
      // 1. URL resource name is a GUID (e.g., subscription) - DOM has the friendly name
      // 2. DOM name contains the URL resource name - they match
      let displayName: string;
      if (domName && (isGuid || domName.toLowerCase().includes(urlResourceName.toLowerCase()))) {
        // DOM name is valid - use it but keep the sub-path from URL if any
        const urlParts = urlDisplayName.split(' | ');
        if (urlParts.length > 1) {
          // Replace the resource name part with DOM name, keep the rest
          displayName = [domName, ...urlParts.slice(1)].join(' | ');
        } else {
          displayName = domName;
        }
      } else {
        // DOM name doesn't match - use URL-extracted display name
        displayName = urlDisplayName;
      }

      // Create new entry (use effectiveTenantId for navigation, effectiveTenantName for grouping)
      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        url: finalUrl,
        tenantId: effectiveTenantId,
        tenantName: effectiveTenantName,
        resourceId: parsed.resourceId,
        displayName,
        visitedAt: Date.now(),
        visitCount: 1,
      };

      all.push(entry);

      // Prune if over limit - use the pruned result
      const pruned = await this.prune(all, settings);

      await storageSet('history', pruned);
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

    const pruned = await this.prune(filtered);
    await storageSet('history', pruned);
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

    const pruned = await this.prune(filtered);
    await storageSet('history', pruned);
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
