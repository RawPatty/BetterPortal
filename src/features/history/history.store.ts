// History store for BetterPortal
import { storageGet, storageSet } from '../../shared/storage';
import type { HistoryEntry, Settings } from '../../shared/types';
import { parsePortalUrl, getTenantNameFromDOM, getResourceNameFromDOM, extractResourceName, extractDisplayName, buildNavigationUrl, isErrorPage } from '../bookmarks/url-parser';
import { settingsStore } from '../settings/settings.store';
import { MAX_ITEMS } from '../../shared/constants';

// Cache for domain → GUID mapping (shared with bookmarks store via storage)
type TenantMapping = Record<string, string>;

async function getTenantMapping(): Promise<TenantMapping> {
  const mapping = await storageGet('tenantMapping' as any);
  return mapping || {};
}

async function saveTenantMapping(mapping: TenantMapping): Promise<void> {
  await storageSet('tenantMapping' as any, mapping);
}

async function learnTenantMapping(tenantGuid: string, tenantDomain: string): Promise<void> {
  if (!tenantGuid || !tenantDomain) return;
  const mapping = await getTenantMapping();
  if (mapping[tenantDomain] !== tenantGuid) {
    mapping[tenantDomain] = tenantGuid;
    await saveTenantMapping(mapping);
  }
}

async function lookupTenantGuid(tenantDomain: string): Promise<string | null> {
  if (!tenantDomain) return null;
  const mapping = await getTenantMapping();
  return mapping[tenantDomain] || null;
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
      // IMPORTANT: Only trust GUID from URL path. Cache and MSAL tokens are unreliable
      // because MSAL caches tokens for ALL tenants, not just the current one.

      const effectiveTenantName = getTenantNameFromDOM() || parsed.tenantDomain || 'Unknown Tenant';
      const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      // Determine effective tenant ID for navigation - MUST be a GUID or null
      let effectiveTenantId: string | null = null;

      if (parsed.tenantId && guidRegex.test(parsed.tenantId)) {
        // URL has GUID in path - this is the ONLY reliable source
        effectiveTenantId = parsed.tenantId;
        // Cache this mapping since it came from URL (reliable)
        if (parsed.tenantDomain) {
          await learnTenantMapping(parsed.tenantId, parsed.tenantDomain);
        }
      }

      // If we have a GUID tenant ID, ensure URL has it in path for reliable navigation
      let finalUrl = url;
      if (effectiveTenantId && !finalUrl.includes(effectiveTenantId)) {
        finalUrl = buildNavigationUrl(finalUrl, effectiveTenantId);
      }

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
