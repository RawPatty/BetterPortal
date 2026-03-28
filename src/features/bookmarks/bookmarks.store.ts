// Bookmarks store for BetterPortal
import { storageGet, storageSet, storageRemove, storageSyncGet, storageSyncSet, storageSyncRemove, storageSyncGetBookmarks, storageSyncSetBookmarks } from '../../shared/storage';
import type { Bookmark, BookmarkSaveResult } from '../../shared/types';
import { MAX_ITEMS, GUID_REGEX } from '../../shared/constants';
import {
  parsePortalUrl,
  getTenantNameFromDOM,
  getResourceNameFromDOM,
  extractResourceName,
  extractDisplayName,
  stripBlade,
  stripTenantGuidFromUrl,
  buildNavigationUrl,
  getCurrentDirectoryInfo,
  isSameDirectory,
  isResourcePage,
  getGuidForDomain,
  getTenantGuidFromPortal,
  getAuthenticatedTenantGuid,
} from './url-parser';
import { settingsStore } from '../settings/settings.store';

// Cache for domain → GUID mapping (learned from URLs)
// This persists so we can look up GUIDs for domains we've seen before
type TenantMapping = Record<string, string>; // domain -> GUID

async function getTenantMapping(): Promise<TenantMapping> {
  const mapping = await storageGet('tenantMapping' as any);
  return mapping || {};
}

async function saveTenantMapping(mapping: TenantMapping): Promise<void> {
  await storageSet('tenantMapping' as any, mapping);
}

async function getBookmarkArea(): Promise<'sync' | 'local'> {
  const s = await settingsStore.get();
  return s.bookmarkSyncEnabled ? 'sync' : 'local';
}

async function readBookmarks(): Promise<Bookmark[]> {
  const area = await getBookmarkArea();
  if (area === 'sync') {
    return storageSyncGetBookmarks();
  }
  const data = await storageGet('bookmarks');
  return data || [];
}

async function writeBookmarks(bookmarks: Bookmark[]): Promise<void> {
  const area = await getBookmarkArea();
  if (area === 'sync') {
    await storageSyncSetBookmarks(bookmarks);
  } else {
    await storageSet('bookmarks', bookmarks);
  }
}

/**
 * Reverse lookup: find which domain a GUID is cached for.
 * Used to detect stale page context GUIDs (if the GUID belongs to a different domain, it's stale).
 */
export async function lookupDomainForGuid(guid: string): Promise<string | null> {
  if (!guid) return null;
  const mapping = await getTenantMapping();
  for (const [domain, cachedGuid] of Object.entries(mapping)) {
    if (cachedGuid === guid) return domain;
  }
  return null;
}

/**
 * Remove a domain entry from the tenant mapping cache.
 * Called when we detect a corrupt/stale entry (same GUID stored under multiple domains).
 */
export async function removeTenantMappingEntry(domain: string): Promise<void> {
  if (!domain) return;
  const mapping = await getTenantMapping();
  if (domain in mapping) {
    delete mapping[domain];
    await saveTenantMapping(mapping);
  }
}

/**
 * Update the shared domain → GUID mapping in storage.
 * Exported so history store can use the same cache without duplicating storage logic.
 */
export async function updateTenantMapping(tenantGuid: string, tenantDomain: string): Promise<void> {
  if (!tenantGuid || !tenantDomain) return;
  const mapping = await getTenantMapping();
  if (mapping[tenantDomain] !== tenantGuid) {
    mapping[tenantDomain] = tenantGuid;
    await saveTenantMapping(mapping);
  }
}

/**
 * Learn and cache the domain → GUID mapping from a URL, then backfill bookmarks.
 * When URL has both GUID in path and domain in hash, we can learn the mapping.
 */
async function learnTenantMapping(tenantGuid: string, tenantDomain: string): Promise<void> {
  await updateTenantMapping(tenantGuid, tenantDomain);

  // Backfill existing bookmarks that have null or domain-string tenantId for this domain.
  // Only update tenantId — never the url field; the GUID is injected at navigation/copy time.
  const bookmarks = await readBookmarks();
  if (bookmarks.length > 0) {
    let updated = false;
    for (const entry of bookmarks) {
      const needsFix = !entry.tenantId || !GUID_REGEX.test(entry.tenantId);
      if (needsFix && entry.tenantName?.toLowerCase() === tenantDomain.toLowerCase()) {
        entry.tenantId = tenantGuid;
        updated = true;
      }
    }
    if (updated) {
      await writeBookmarks(bookmarks);
    }
  }
}

/**
 * Check if a GUID can safely be used for a given domain:
 * - GUID not in cache → true (unknown, safe to use)
 * - GUID maps to exactly this domain and no other → true (correct)
 * - GUID maps to multiple domains OR to a different domain → false (corrupt/stale)
 *
 * Multi-domain detection catches cache corruption from old code that assigned
 * the home-tenant GUID to guest-tenant domains (same GUID ends up under several keys).
 */
export async function isGuidValidForDomain(guid: string, domain: string): Promise<boolean> {
  const mapping = await getTenantMapping();
  const lowerDomain = domain.toLowerCase();
  let count = 0;
  let sole: string | null = null;
  for (const [d, g] of Object.entries(mapping)) {
    if (g === guid) {
      count++;
      if (count === 1) sole = d.toLowerCase();
      else return false; // mapped to 2+ domains — ambiguous/corrupt
    }
  }
  return count === 0 || sole === lowerDomain;
}

/**
 * Look up a GUID for a domain from the cache
 */
export async function lookupTenantGuid(tenantDomain: string): Promise<string | null> {
  if (!tenantDomain) return null;

  const mapping = await getTenantMapping();
  return mapping[tenantDomain] || null;
}

/**
 * Startup migration: backfill tenantId GUIDs for bookmarks saved before GUID storage was implemented.
 * Handles both null tenantId and old domain-string tenantId values.
 * Uses cached tenantMapping — bookmarks for unknown domains are left unchanged.
 */
export async function migrateBookmarks(): Promise<void> {
  const bookmarks = await readBookmarks();
  if (!bookmarks || bookmarks.length === 0) return;

  const mapping = await getTenantMapping();
  let updated = false;

  for (const bookmark of bookmarks) {
    // Fix tenantId: backfill from cached mapping if missing or non-GUID
    if (Object.keys(mapping).length > 0) {
      const needsFix = !bookmark.tenantId || !GUID_REGEX.test(bookmark.tenantId);
      if (needsFix) {
        const domain = bookmark.tenantName?.toLowerCase();
        const guid = domain ? mapping[domain] : null;
        if (guid) {
          bookmark.tenantId = guid;
          updated = true;
        }
      }
    }

    // Strip any GUID from stored url — the url field should be the canonical resource URL.
    // GUIDs are injected at navigation/copy time from tenantId, never stored in url.
    const strippedUrl = stripTenantGuidFromUrl(bookmark.url);
    if (strippedUrl !== bookmark.url) {
      bookmark.url = strippedUrl;
      updated = true;
    }
  }

  if (updated) {
    await writeBookmarks(bookmarks);
  }
}

/**
 * Resolve the correct navigation URL for an item and navigate to it.
 * Handles same-directory (no redirect) vs cross-directory (inject GUID) logic.
 */
export async function navigateToItem(url: string, tenantId: string | null, tenantName: string | null): Promise<void> {
  const currentDir = getCurrentDirectoryInfo();
  const domain = tenantName?.toLowerCase() || null;
  const sameDirectory = isSameDirectory(currentDir.domain, domain);

  // Trust the stored tenantId directly — it was validated at save time, same as buildCopyUrl.
  // Do NOT re-validate with isGuidValidForDomain here: tenantName may be a display name
  // ("Contoso") not a domain ("contoso.onmicrosoft.com"), causing false rejections.
  let tenantGuid: string | null = null;
  if (tenantId && GUID_REGEX.test(tenantId)) {
    tenantGuid = tenantId;
  } else if (domain) {
    // Fallback: cache lookup (validate here since cache source is less controlled)
    const cachedGuid = await lookupTenantGuid(domain);
    if (cachedGuid && await isGuidValidForDomain(cachedGuid, domain)) {
      tenantGuid = cachedGuid;
    }
  }

  let navigationUrl = url;
  if (!sameDirectory && tenantGuid) {
    navigationUrl = buildNavigationUrl(url, tenantGuid);
  }

  window.location.href = navigationUrl;
}

export const bookmarkStore = {
  /**
   * Get all bookmarks
   */
  async getAll(): Promise<Bookmark[]> {
    return readBookmarks();
  },

  /**
   * Get bookmarks for a specific tenant
   */
  async getByTenant(tenantId: string): Promise<Bookmark[]> {
    const all = await this.getAll();
    return all.filter((b) => b.tenantId === tenantId);
  },

  /**
   * Get a bookmark by ID
   */
  async get(id: string): Promise<Bookmark | null> {
    const all = await this.getAll();
    return all.find((b) => b.id === id) || null;
  },

  /**
   * Get bookmarks grouped by tenant
   */
  async getGroupedByTenant(): Promise<Map<string, Bookmark[]>> {
    const all = await this.getAll();
    const grouped = new Map<string, Bookmark[]>();

    for (const bookmark of all) {
      const key = bookmark.tenantId;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(bookmark);
    }

    // Sort bookmarks within each tenant by accessCount (most used first)
    for (const [, bookmarks] of grouped) {
      bookmarks.sort((a, b) => b.accessCount - a.accessCount);
    }

    return grouped;
  },

  /**
   * Save a new bookmark from the current page
   */
  async saveCurrentPage(options?: {
    alias?: string;
    stateDepth?: 'full' | 'resource';
  }): Promise<BookmarkSaveResult> {
    const url = window.location.href;

    if (!isResourcePage(url)) {
      return { success: false, reason: 'not_resource_page' };
    }

    const parsed = parsePortalUrl(url);
    const settings = await settingsStore.get();

    // Determine final URL based on state depth
    const stateDepth = options?.stateDepth || settings.defaultStateDepth;
    let finalUrl = stateDepth === 'resource' ? stripBlade(url) : url;

    // Get display name from URL (resource name + sub-path)
    const urlDisplayName = parsed.resourceId ? extractDisplayName(parsed.resourceId) : 'Unknown';
    const urlResourceName = parsed.resourceId ? extractResourceName(parsed.resourceId) : 'Unknown';

    // Get DOM name for potential friendly formatting
    const domName = getResourceNameFromDOM();

    // Check if URL resource name looks like a GUID (subscriptions use GUIDs, not friendly names)
    const isGuid = GUID_REGEX.test(urlResourceName);

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
      displayName = urlDisplayName;
    }

    // Determine tenant ID for navigation (MUST be GUID) and tenant name for grouping
    //
    // Strategy: resolve GUID at save time via multiple sources:
    // 1. URL path GUID (rare — only in BetterPortal-constructed directory-switch URLs)
    // 2. Page context (getTenantGuidFromPortal) — safe when item's domain matches current directory
    // 3. Tenant mapping cache — for cross-directory items where we've previously learned the GUID
    // 4. null — directory never visited; learnTenantMapping backfill will heal later

    const effectiveTenantName = getTenantNameFromDOM() || parsed.tenantDomain || 'Unknown Tenant';

    let effectiveTenantId: string | null = null;

    if (parsed.tenantId && GUID_REGEX.test(parsed.tenantId)) {
      // 1. URL path GUID — always trust it
      effectiveTenantId = parsed.tenantId;
    } else {
      const itemDomain = effectiveTenantName.toLowerCase();
      const currentDir = getCurrentDirectoryInfo();
      const sameDir = isSameDirectory(currentDir.domain, itemDomain);

      // 2. Fetch-intercepted MSAL GUID — most authoritative source.
      //    page-context.ts captures the GUID from login.microsoftonline.com/{GUID}/oauth2 requests.
      //    Only use for same-directory items.
      if (sameDir) {
        const fetchGuid = getAuthenticatedTenantGuid();
        if (fetchGuid) {
          effectiveTenantId = fetchGuid;
        }
      }

      // 3. Page context — window.Portal.tenant.id — only for same-directory items.
      //    Reject if the GUID maps to a different domain OR multiple domains (corrupt cache).
      if (!effectiveTenantId && sameDir) {
        const pageGuid = getTenantGuidFromPortal();
        if (pageGuid && await isGuidValidForDomain(pageGuid, itemDomain)) {
          effectiveTenantId = pageGuid;
        }
      }

      // 4. MSAL token scan — domain-aware. Same validity check: guest tokens have
      //    tid = HOME GUID but upn ending in @guest-tenant (false-positive domain match).
      if (!effectiveTenantId) {
        const msalGuid = getGuidForDomain(itemDomain);
        if (msalGuid && await isGuidValidForDomain(msalGuid, itemDomain)) {
          effectiveTenantId = msalGuid;
        }
      }

      // 5. Tenant mapping cache — previously learned domain→GUID.
      //    Same validity check: corrupt cache may have the same GUID under multiple domains.
      //    If invalid, remove the bad entry so navigateToItem won't use it either.
      if (!effectiveTenantId) {
        const cachedGuid = await lookupTenantGuid(itemDomain);
        if (cachedGuid && await isGuidValidForDomain(cachedGuid, itemDomain)) {
          effectiveTenantId = cachedGuid;
        } else if (cachedGuid) {
          await removeTenantMappingEntry(itemDomain);
        }
      }
    }

    // Cache the mapping and backfill existing items with null tenantId for this domain
    if (effectiveTenantId && parsed.tenantDomain) {
      await learnTenantMapping(effectiveTenantId, parsed.tenantDomain);
    }

    // Strip any tenant GUID from the stored URL — the url field should be the canonical
    // resource URL. The GUID is stored separately in tenantId and injected at navigation/copy time.
    finalUrl = stripTenantGuidFromUrl(finalUrl);

    const bookmark: Bookmark = {
      id: crypto.randomUUID(),
      url: finalUrl,
      tenantId: effectiveTenantId,
      tenantName: effectiveTenantName,
      resourceId: parsed.resourceId || '',
      displayName,
      alias: options?.alias || null,
      stateDepth,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 0,
    };

    // Check for existing bookmark with same resource+tenant (use tenantName for grouping consistency)
    const all = await this.getAll();
    const existingIndex = all.findIndex(
      (b) => b.resourceId === bookmark.resourceId && b.tenantName === bookmark.tenantName
    );

    if (existingIndex >= 0) {
      // Update existing bookmark — always allowed
      all[existingIndex] = {
        ...all[existingIndex],
        url: bookmark.url,
        displayName: bookmark.displayName,
        stateDepth: bookmark.stateDepth,
        alias: bookmark.alias ?? all[existingIndex].alias,
      };
      await writeBookmarks(all);
      return { success: true, bookmark: all[existingIndex] };
    }

    // New bookmark — enforce limit
    if (all.length >= MAX_ITEMS.BOOKMARKS) {
      return { success: false, reason: 'limit_reached' };
    }

    all.push(bookmark);
    await writeBookmarks(all);
    return { success: true, bookmark };
  },

  /**
   * Save a bookmark directly
   */
  async save(bookmark: Bookmark): Promise<BookmarkSaveResult> {
    const all = await this.getAll();
    const existingIndex = all.findIndex((b) => b.id === bookmark.id);

    if (existingIndex >= 0) {
      // Update existing — always allowed
      all[existingIndex] = bookmark;
      await writeBookmarks(all);
      return { success: true, bookmark: all[existingIndex] };
    }

    // New bookmark — enforce limit
    if (all.length >= MAX_ITEMS.BOOKMARKS) {
      return { success: false, reason: 'limit_reached' };
    }

    all.push(bookmark);
    await writeBookmarks(all);
    return { success: true, bookmark };
  },

  /**
   * Update a bookmark
   */
  async update(id: string, partial: Partial<Bookmark>): Promise<Bookmark | null> {
    const all = await this.getAll();
    const index = all.findIndex((b) => b.id === id);

    if (index < 0) {
      return null;
    }

    all[index] = { ...all[index], ...partial };
    await writeBookmarks(all);
    return all[index];
  },

  /**
   * Delete a bookmark
   */
  async delete(id: string): Promise<boolean> {
    const all = await this.getAll();
    const filtered = all.filter((b) => b.id !== id);

    if (filtered.length === all.length) {
      return false;
    }

    await writeBookmarks(filtered);
    return true;
  },

  /**
   * Navigate to a bookmark
   */
  async navigate(id: string): Promise<void> {
    const bookmark = await this.get(id);
    if (!bookmark) {
      console.error('[BetterPortal] Bookmark not found:', id);
      return;
    }

    // Update access stats
    await this.update(id, {
      lastAccessed: Date.now(),
      accessCount: bookmark.accessCount + 1,
    });

    await navigateToItem(bookmark.url, bookmark.tenantId, bookmark.tenantName);
  },

  /**
   * Export bookmarks as JSON
   */
  async export(): Promise<string> {
    const bookmarks = await this.getAll();
    return JSON.stringify(bookmarks, null, 2);
  },

  /**
   * Import bookmarks from JSON
   */
  async import(json: string): Promise<{ added: number; skipped: number }> {
    const imported = JSON.parse(json) as Bookmark[];
    const existing = await this.getAll();

    const existingKeys = new Set(
      existing.map((b) => `${b.resourceId}:${b.tenantId}`)
    );

    let added = 0;
    let skipped = 0;

    for (const bookmark of imported) {
      const key = `${bookmark.resourceId}:${bookmark.tenantId}`;
      if (existingKeys.has(key)) {
        skipped++;
      } else {
        existing.push({
          ...bookmark,
          id: crypto.randomUUID(), // Generate new ID
        });
        existingKeys.add(key);
        added++;
      }
    }

    await writeBookmarks(existing);
    return { added, skipped };
  },

  /**
   * Search bookmarks
   */
  async search(query: string): Promise<Bookmark[]> {
    if (!query.trim()) {
      return this.getAll();
    }

    const all = await this.getAll();
    const lowerQuery = query.toLowerCase();

    return all.filter((bookmark) => {
      const searchText = [
        bookmark.displayName,
        bookmark.alias,
        bookmark.tenantName,
        bookmark.resourceId,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchText.includes(lowerQuery);
    });
  },
};

/**
 * Migrate bookmarks from local storage to sync storage.
 * Called when user enables bookmark sync.
 * Merges local into sync, deduplicating by resourceId:tenantName.
 * Sync bookmarks take precedence for duplicates.
 */
export async function migrateBookmarksToSync(): Promise<void> {
  const local = await storageGet('bookmarks') || [];
  // Read existing per-item sync bookmarks (current format)
  const syncedPerItem = await storageSyncGetBookmarks();
  // Also check old single-key format (backward compat for users on previous version)
  const syncedOldFormat = await storageSyncGet('bookmarks') || [];

  // Start with per-item sync bookmarks (most authoritative)
  const merged = [...syncedPerItem];
  const syncedKeys = new Set(syncedPerItem.map((b) => `${b.resourceId}:${b.tenantName}`));

  // Add old-format sync bookmarks not already present
  for (const bookmark of syncedOldFormat) {
    const key = `${bookmark.resourceId}:${bookmark.tenantName}`;
    if (!syncedKeys.has(key)) {
      merged.push(bookmark);
      syncedKeys.add(key);
    }
  }

  // Add local bookmarks not already in sync
  for (const bookmark of local) {
    const key = `${bookmark.resourceId}:${bookmark.tenantName}`;
    if (!syncedKeys.has(key)) {
      merged.push(bookmark);
      syncedKeys.add(key);
    }
  }

  await storageSyncSetBookmarks(merged);

  // Remove old single-key format if it existed
  if (syncedOldFormat.length > 0) {
    await storageSyncRemove('bookmarks');
  }

  await storageRemove('bookmarks');
}

/**
 * Migrate bookmarks from sync storage to local storage.
 * Called when user disables bookmark sync.
 */
export async function migrateBookmarksFromSync(): Promise<void> {
  // Read per-item sync bookmarks (current format)
  const syncedPerItem = await storageSyncGetBookmarks();
  // Also check old single-key format (backward compat)
  const syncedOldFormat = await storageSyncGet('bookmarks') || [];

  // Merge, per-item takes precedence (newer format)
  const merged = [...syncedPerItem];
  const seenIds = new Set(syncedPerItem.map((b) => b.id));
  for (const b of syncedOldFormat) {
    if (!seenIds.has(b.id)) merged.push(b);
  }

  await storageSet('bookmarks', merged);

  // Clear all per-item sync keys
  await storageSyncSetBookmarks([]);

  // Clear old single-key format if it existed
  if (syncedOldFormat.length > 0) {
    await storageSyncRemove('bookmarks');
  }
}
