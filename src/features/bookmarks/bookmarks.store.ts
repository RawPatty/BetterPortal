// Bookmarks store for BetterPortal
import { storageGet, storageSet, storageRemove, storageSyncGet, storageSyncSet, storageSyncRemove } from '../../shared/storage';
import type { Bookmark, BookmarkSaveResult } from '../../shared/types';
import { MAX_ITEMS } from '../../shared/constants';
import {
  parsePortalUrl,
  getTenantNameFromDOM,
  getResourceNameFromDOM,
  extractResourceName,
  extractDisplayName,
  stripBlade,
  buildNavigationUrl,
  getCurrentDirectoryInfo,
  isSameDirectory,
  getTenantGuidFromPortal,
} from './url-parser';
import { settingsStore } from '../settings/settings.store';

const GUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const data = area === 'sync'
    ? await storageSyncGet('bookmarks')
    : await storageGet('bookmarks');
  return data || [];
}

async function writeBookmarks(bookmarks: Bookmark[]): Promise<void> {
  const area = await getBookmarkArea();
  if (area === 'sync') {
    await storageSyncSet('bookmarks', bookmarks);
  } else {
    await storageSet('bookmarks', bookmarks);
  }
}

/**
 * Learn and cache the domain → GUID mapping from a URL
 * When URL has both GUID in path and domain in hash, we can learn the mapping
 */
async function learnTenantMapping(tenantGuid: string, tenantDomain: string): Promise<void> {
  if (!tenantGuid || !tenantDomain) return;

  const mapping = await getTenantMapping();
  const isNew = mapping[tenantDomain] !== tenantGuid;
  if (isNew) {
    mapping[tenantDomain] = tenantGuid;
    await saveTenantMapping(mapping);
  }

  // Backfill existing bookmarks that have null or domain-string tenantId for this domain
  const bookmarks = await readBookmarks();
  if (bookmarks.length > 0) {
    let updated = false;
    for (const entry of bookmarks) {
      const needsFix = !entry.tenantId || !GUID_REGEX.test(entry.tenantId);
      if (needsFix && entry.tenantName?.toLowerCase() === tenantDomain.toLowerCase()) {
        entry.tenantId = tenantGuid;
        if (!entry.url.includes(tenantGuid)) {
          entry.url = buildNavigationUrl(entry.url, tenantGuid);
        }
        updated = true;
      }
    }
    if (updated) {
      await writeBookmarks(bookmarks);
      console.log('[BetterPortal] Backfilled missing or invalid tenantIds for domain:', tenantDomain);
    }
  }
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
  if (Object.keys(mapping).length === 0) return;

  let updated = false;
  for (const bookmark of bookmarks) {
    const needsFix = !bookmark.tenantId || !GUID_REGEX.test(bookmark.tenantId);
    if (!needsFix) continue;

    const domain = bookmark.tenantName?.toLowerCase();
    if (!domain) continue;

    const guid = mapping[domain];
    if (!guid) continue;

    bookmark.tenantId = guid;
    if (!bookmark.url.includes(guid)) {
      bookmark.url = buildNavigationUrl(bookmark.url, guid);
    }
    updated = true;
    console.log('[BetterPortal] Migrated bookmark:', bookmark.id, 'domain:', domain, '-> GUID:', guid);
  }

  if (updated) {
    await writeBookmarks(bookmarks);
    console.log('[BetterPortal] Bookmark migration complete');
  }
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
      console.log('[BetterPortal] Bookmark using DOM name:', displayName, isGuid ? '(URL was GUID)' : '(matched URL)');
    } else {
      displayName = urlDisplayName;
      console.log('[BetterPortal] Bookmark using URL display name:', urlDisplayName, '(DOM was:', domName, ')');
    }

    // Determine tenant ID for navigation (MUST be GUID) and tenant name for grouping
    // tenantId: Used for cross-tenant navigation - MUST be a GUID, null if unavailable
    // tenantName: Used for grouping/display - should be the domain for consistent grouping
    //
    // Strategy for finding tenant GUID (in order of reliability):
    // 1. URL path GUID (parsed.tenantId) - most reliable, directly from current URL
    // 2. Cached mapping lookup (if we learned it before from a URL with GUID)
    // 3. getTenantGuidFromPortal() - may return wrong tenant from MSAL cache, but better than nothing
    // 4. null - if no GUID found, don't store domain as tenantId

    const effectiveTenantName = getTenantNameFromDOM() || parsed.tenantDomain || 'Unknown Tenant';

    // Determine effective tenant ID for navigation - MUST be a GUID or null
    // IMPORTANT: Only trust GUID from URL path. Cache and MSAL tokens are unreliable
    // because MSAL caches tokens for ALL tenants, not just the current one.
    let effectiveTenantId: string | null = null;

    if (parsed.tenantId && GUID_REGEX.test(parsed.tenantId)) {
      // URL has GUID in path - this is the ONLY reliable source
      effectiveTenantId = parsed.tenantId;

      // Cache this mapping since it came from URL (reliable)
      if (parsed.tenantDomain) {
        await learnTenantMapping(parsed.tenantId, parsed.tenantDomain);
      }
      console.log('[BetterPortal] Using GUID from URL path (reliable):', effectiveTenantId);
    } else {
      // URL does not have GUID in path - try fallbacks
      console.log('[BetterPortal] No GUID in URL path - trying fallbacks');

      // Fallback 1: Try page context / MSAL — reliable for current page's tenant at save time
      if (!effectiveTenantId) {
        effectiveTenantId = getTenantGuidFromPortal();
        if (effectiveTenantId) {
          console.log('[BetterPortal] Got tenant GUID from page context/MSAL:', effectiveTenantId);
          const domain = parsed.tenantDomain || effectiveTenantName;
          if (domain && domain !== 'Unknown Tenant') {
            await learnTenantMapping(effectiveTenantId, domain);
          }
        }
      }

      // Fallback 2: Try cached domain→GUID mapping
      if (!effectiveTenantId) {
        const domain = parsed.tenantDomain || effectiveTenantName;
        if (domain && domain !== 'Unknown Tenant') {
          effectiveTenantId = await lookupTenantGuid(domain);
          if (effectiveTenantId) {
            console.log('[BetterPortal] Got tenant GUID from cached mapping:', effectiveTenantId);
          }
        }
      }

      if (!effectiveTenantId) {
        console.log('[BetterPortal] No tenant GUID available from any source');
      }
    }

    // If we have a GUID tenant ID, ensure the URL has it in the path for reliable navigation
    if (effectiveTenantId && !finalUrl.includes(effectiveTenantId)) {
      finalUrl = buildNavigationUrl(finalUrl, effectiveTenantId);
      console.log('[BetterPortal] Updated URL with tenant GUID:', finalUrl);
    }

    console.log('[BetterPortal] Bookmark tenant detection:', {
      urlTenantId: parsed.tenantId,
      urlDomain: parsed.tenantDomain,
      effectiveId: effectiveTenantId,
      effectiveName: effectiveTenantName
    });

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
      isStale: false,
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

    // Determine correct tenant GUID to use for navigation
    const currentDir = getCurrentDirectoryInfo();
    const bookmarkDomain = bookmark.tenantName?.toLowerCase() || null;
    const sameDirectory = isSameDirectory(currentDir.domain, bookmarkDomain);

    // Get bookmark's tenant GUID - prefer stored tenantId, fallback to cached mapping
    let bookmarkTenantGuid = bookmark.tenantId;
    if (!bookmarkTenantGuid && bookmarkDomain) {
      bookmarkTenantGuid = await lookupTenantGuid(bookmarkDomain);
    }

    // Determine navigation URL based on directory context
    let navigationUrl = bookmark.url;

    if (sameDirectory) {
      // Same directory: use original URL without GUID injection
      // This avoids redirect flash when already in the correct tenant context
      console.log('[BetterPortal] Same directory navigation - using original URL (no redirect)');
    } else {
      // Different directory: inject target GUID for cross-tenant navigation
      if (bookmarkTenantGuid) {
        navigationUrl = buildNavigationUrl(bookmark.url, bookmarkTenantGuid);
        console.log('[BetterPortal] Cross-directory navigation - injecting target GUID:', bookmarkTenantGuid);
      } else {
        console.log('[BetterPortal] Cross-directory navigation requested but no GUID available - using original URL');
      }
    }

    // Navigate
    window.location.href = navigationUrl;
  },

  /**
   * Mark a bookmark as stale
   */
  async markStale(id: string, isStale: boolean): Promise<void> {
    await this.update(id, { isStale });
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
 */
export async function migrateBookmarksToSync(): Promise<void> {
  const local = await storageGet('bookmarks') || [];
  await storageSyncSet('bookmarks', local);
  await storageRemove('bookmarks');
}

/**
 * Migrate bookmarks from sync storage to local storage.
 * Called when user disables bookmark sync.
 */
export async function migrateBookmarksFromSync(): Promise<void> {
  const synced = await storageSyncGet('bookmarks') || [];
  await storageSet('bookmarks', synced);
  await storageSyncRemove('bookmarks');
}
