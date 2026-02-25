import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock chrome.storage
const mockStorage: Record<string, any> = {};
const mockSyncStorage: Record<string, any> = {};
vi.mock('../../shared/storage', () => ({
  storageGet: vi.fn((key: string) => Promise.resolve(mockStorage[key] ?? null)),
  storageSet: vi.fn((key: string, value: any) => { mockStorage[key] = value; return Promise.resolve(); }),
  storageRemove: vi.fn((key: string) => { delete mockStorage[key]; return Promise.resolve(); }),
  storageSyncGet: vi.fn((key: string) => Promise.resolve(mockSyncStorage[key] ?? null)),
  storageSyncSet: vi.fn((key: string, value: any) => { mockSyncStorage[key] = value; return Promise.resolve(); }),
  storageSyncRemove: vi.fn((key: string) => { delete mockSyncStorage[key]; return Promise.resolve(); }),
  storageSyncGetBookmarks: vi.fn(() => {
    const bookmarks = Object.entries(mockSyncStorage)
      .filter(([k]) => k.startsWith('bp_bm_'))
      .map(([, v]) => v);
    return Promise.resolve(bookmarks);
  }),
  storageSyncSetBookmarks: vi.fn((bookmarks: any[]) => {
    Object.keys(mockSyncStorage).filter(k => k.startsWith('bp_bm_')).forEach(k => delete mockSyncStorage[k]);
    bookmarks.forEach((b: any) => { mockSyncStorage[`bp_bm_${b.id}`] = b; });
    return Promise.resolve();
  }),
}));

// Mock settings store
vi.mock('../settings/settings.store', () => ({
  settingsStore: {
    get: vi.fn(() => Promise.resolve({
      defaultStateDepth: 'resource',
    })),
  },
}));

// Mock URL parser functions
vi.mock('./url-parser', () => ({
  parsePortalUrl: vi.fn((url: string) => ({
    tenantId: null,
    tenantDomain: 'contoso.onmicrosoft.com',
    resourceId: '/subscriptions/sub-123/resourceGroups/rg-test/providers/Microsoft.Web/sites/my-app',
    blade: null,
    fullUrl: url,
  })),
  extractDisplayName: vi.fn(() => 'my-app'),
  extractResourceName: vi.fn(() => 'my-app'),
  getTenantNameFromDOM: vi.fn(() => 'contoso.onmicrosoft.com'),
  getResourceNameFromDOM: vi.fn(() => 'my-app'),
  getTenantGuidFromPortal: vi.fn(() => null),
  stripBlade: vi.fn((url: string) => url),
  buildNavigationUrl: vi.fn((url: string, tenantId: string) => {
    if (!tenantId) return url;
    const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId);
    if (isGuid && !url.includes(tenantId)) {
      return url.replace('portal.azure.com/', `portal.azure.com/${tenantId}/`);
    }
    return url;
  }),
  stripTenantGuidFromUrl: vi.fn((url: string) =>
    url.replace(/portal\.azure\.com\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i, 'portal.azure.com/')
  ),
  getCurrentDirectoryInfo: vi.fn(() => ({ domain: 'contoso.onmicrosoft.com', guid: null })),
  isSameDirectory: vi.fn(() => true),
}));

// Mock crypto.randomUUID
vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'mock-uuid-' + Math.random().toString(36).slice(2, 8)) });

// Mock window.location
const mockLocation = { href: 'https://portal.azure.com/#@contoso.onmicrosoft.com/resource/subscriptions/sub-123' };
vi.stubGlobal('window', { location: mockLocation });

import { bookmarkStore, migrateBookmarks, migrateBookmarksToSync, migrateBookmarksFromSync } from './bookmarks.store';
import { parsePortalUrl, getTenantGuidFromPortal } from './url-parser';
import type { BookmarkSaveResult } from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/types';
import { settingsStore } from '../settings/settings.store';

describe('bookmarkStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockStorage).forEach(key => delete mockStorage[key]);
    mockLocation.href = 'https://portal.azure.com/#@contoso.onmicrosoft.com/resource/subscriptions/sub-123';
  });

  describe('tenant GUID resolution at save time', () => {
    it('should store GUID from page context when item domain matches current directory', async () => {
      const pageContextGuid = '99999999-9999-9999-9999-999999999999';
      vi.mocked(getTenantGuidFromPortal).mockReturnValueOnce(pageContextGuid);
      // Default mocks: parsePortalUrl returns tenantDomain 'contoso.onmicrosoft.com'
      // getCurrentDirectoryInfo returns domain 'contoso.onmicrosoft.com' — domains match

      const result = await bookmarkStore.saveCurrentPage();

      expect(result.success).toBe(true);
      if (result.success) expect(result.bookmark.tenantId).toBe(pageContextGuid);
    });

    it('should store null tenantId when domains do not match and cache has no mapping', async () => {
      const pageContextGuid = '99999999-9999-9999-9999-999999999999';
      vi.mocked(getTenantGuidFromPortal).mockReturnValueOnce(pageContextGuid);
      // Make current directory different from item domain
      const { getCurrentDirectoryInfo } = await import('./url-parser');
      vi.mocked(getCurrentDirectoryInfo).mockReturnValueOnce({
        domain: 'fabrikam.onmicrosoft.com',
        guid: null,
      });

      const result = await bookmarkStore.saveCurrentPage();

      expect(result.success).toBe(true);
      if (result.success) expect(result.bookmark.tenantId).toBeNull();
    });

    it('should store GUID from cache for cross-directory item', async () => {
      // Populate the tenant mapping cache for contoso
      const { updateTenantMapping } = await import('./bookmarks.store');
      await updateTenantMapping('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'contoso.onmicrosoft.com');

      // Current directory is fabrikam (different from item's contoso)
      vi.mocked(getTenantGuidFromPortal).mockReturnValueOnce('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
      const { getCurrentDirectoryInfo } = await import('./url-parser');
      vi.mocked(getCurrentDirectoryInfo).mockReturnValueOnce({
        domain: 'fabrikam.onmicrosoft.com',
        guid: null,
      });

      const result = await bookmarkStore.saveCurrentPage();

      expect(result.success).toBe(true);
      if (result.success) expect(result.bookmark.tenantId).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    });

    it('should store URL path GUID when present (highest priority)', async () => {
      const urlGuid = '11111111-1111-1111-1111-111111111111';
      const { parsePortalUrl } = await import('./url-parser');
      vi.mocked(parsePortalUrl).mockReturnValueOnce({
        tenantId: urlGuid,
        tenantDomain: 'contoso.onmicrosoft.com',
        resourceId: '/subscriptions/sub-123/resourceGroups/rg-test/providers/Microsoft.Web/sites/my-app',
        blade: null,
        fullUrl: 'https://portal.azure.com/' + urlGuid + '/#@contoso.onmicrosoft.com/resource/subscriptions/sub-123',
      });

      const result = await bookmarkStore.saveCurrentPage();

      expect(result.success).toBe(true);
      if (result.success) expect(result.bookmark.tenantId).toBe(urlGuid);
    });
  });

  describe('backfill null tenantIds on mapping learned', () => {
    it('should backfill existing bookmarks when a new mapping is learned', async () => {
      const guid = '77777777-7777-7777-7777-777777777777';
      // Pre-populate bookmarks with null tenantId
      mockStorage['bookmarks'] = [
        {
          id: 'old-bm-1',
          resourceId: '/sub/old-1',
          tenantId: null,
          tenantName: 'contoso.onmicrosoft.com',
          displayName: 'Old Bookmark',
          alias: null,
          stateDepth: 'resource',
          createdAt: Date.now() - 10000,
          lastAccessed: Date.now() - 10000,
          accessCount: 0,
          isStale: false,
          url: 'https://portal.azure.com/#@contoso.onmicrosoft.com/resource/sub/old-1',
        },
        {
          id: 'old-bm-2',
          resourceId: '/sub/old-2',
          tenantId: null,
          tenantName: 'fabrikam.onmicrosoft.com',
          displayName: 'Other Bookmark',
          alias: null,
          stateDepth: 'resource',
          createdAt: Date.now() - 10000,
          lastAccessed: Date.now() - 10000,
          accessCount: 0,
          isStale: false,
          url: 'https://portal.azure.com/#@fabrikam.onmicrosoft.com/resource/sub/old-2',
        },
      ];
      mockStorage['tenantMapping'] = {};

      // Save a bookmark with a URL that has the GUID
      vi.mocked(parsePortalUrl).mockReturnValueOnce({
        tenantId: guid,
        tenantDomain: 'contoso.onmicrosoft.com',
        resourceId: '/subscriptions/new-sub/resourceGroups/rg/providers/Microsoft.Web/sites/new-app',
        blade: null,
        fullUrl: `https://portal.azure.com/${guid}/#@contoso.onmicrosoft.com/resource/subscriptions/new-sub`,
      } as any);

      await bookmarkStore.saveCurrentPage();

      // Check that old-bm-1 (contoso) got backfilled
      const bookmarks = mockStorage['bookmarks'];
      const old1 = bookmarks.find((b: any) => b.id === 'old-bm-1');
      expect(old1.tenantId).toBe(guid);

      // old-bm-2 (fabrikam) should NOT be backfilled
      const old2 = bookmarks.find((b: any) => b.id === 'old-bm-2');
      expect(old2.tenantId).toBeNull();
    });

    it('should backfill tenantId without modifying url during backfill', async () => {
      const guid = '66666666-6666-6666-6666-666666666666';
      const originalUrl = 'https://portal.azure.com/#@contoso.onmicrosoft.com/resource/sub/url-test';
      mockStorage['bookmarks'] = [
        {
          id: 'url-bm',
          resourceId: '/sub/url-test',
          tenantId: null,
          tenantName: 'contoso.onmicrosoft.com',
          displayName: 'URL Test',
          alias: null,
          stateDepth: 'resource',
          createdAt: Date.now() - 10000,
          lastAccessed: Date.now() - 10000,
          accessCount: 0,
          isStale: false,
          url: originalUrl,
        },
      ];
      mockStorage['tenantMapping'] = {};

      vi.mocked(parsePortalUrl).mockReturnValueOnce({
        tenantId: guid,
        tenantDomain: 'contoso.onmicrosoft.com',
        resourceId: '/subscriptions/trigger/resourceGroups/rg/providers/Microsoft.Web/sites/trigger-app',
        blade: null,
        fullUrl: `https://portal.azure.com/${guid}/#@contoso.onmicrosoft.com/resource/subscriptions/trigger`,
      } as any);

      await bookmarkStore.saveCurrentPage();

      const bookmarks = mockStorage['bookmarks'];
      const backfilled = bookmarks.find((b: any) => b.id === 'url-bm');
      // tenantId is backfilled with the GUID
      expect(backfilled.tenantId).toBe(guid);
      // url is NOT modified — GUID lives only in tenantId, injected at navigation/copy time
      expect(backfilled.url).toBe(originalUrl);
    });
  });

  describe('learnTenantMapping backfill', () => {
    it('should backfill domain-string tenantId with GUID', async () => {
      const domainGuid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      // Seed a bookmark with a domain string as tenantId (old format)
      mockStorage['bookmarks'] = [{
        id: 'bm-1',
        url: 'https://portal.azure.com/#@contoso.onmicrosoft.com/resource/subscriptions/sub-123/resourceGroups/rg/providers/Microsoft.Web/sites/app',
        tenantId: 'contoso.onmicrosoft.com',
        tenantName: 'contoso.onmicrosoft.com',
        resourceId: '/subscriptions/sub-123/resourceGroups/rg/providers/Microsoft.Web/sites/app',
        displayName: 'app',
        alias: null,
        stateDepth: 'resource' as const,
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        accessCount: 0,
        isStale: false,
      }];

      // Trigger learnTenantMapping by saving a bookmark on a page with GUID in URL
      vi.mocked(parsePortalUrl).mockReturnValueOnce({
        tenantId: domainGuid,
        tenantDomain: 'contoso.onmicrosoft.com',
        resourceId: '/subscriptions/sub-123/resourceGroups/rg/providers/Microsoft.Web/sites/other',
        blade: null,
        fullUrl: `https://portal.azure.com/${domainGuid}/#@contoso.onmicrosoft.com/resource/subscriptions/sub-123`,
      } as any);
      mockLocation.href = `https://portal.azure.com/${domainGuid}/#@contoso.onmicrosoft.com/resource/subscriptions/sub-123`;

      await bookmarkStore.saveCurrentPage();

      // The pre-existing bookmark with domain-string tenantId should be fixed
      const bookmarks = mockStorage['bookmarks'] as any[];
      const fixed = bookmarks.find((b: any) => b.id === 'bm-1');
      expect(fixed.tenantId).toBe(domainGuid);
      // url is NOT modified — GUID lives only in tenantId
      expect(fixed.url).not.toContain(domainGuid);
    });
  });
});

describe('bookmark limit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  });

  it('returns limit_reached when bookmarks are at 150 and a new one is saved', async () => {
    // Fill storage with 150 bookmarks
    const existing = Array.from({ length: 150 }, (_, i) => ({
      id: `bm-${i}`,
      url: `https://portal.azure.com/#resource/subscriptions/sub-1/resourceGroups/rg-${i}`,
      tenantId: null,
      tenantName: 'contoso.onmicrosoft.com',
      resourceId: `/subscriptions/sub-1/resourceGroups/rg-${i}`,
      displayName: `rg-${i}`,
      alias: null,
      stateDepth: 'full' as const,
      createdAt: 0,
      lastAccessed: 0,
      accessCount: 0,
      isStale: false,
    }));
    mockStorage['bookmarks'] = existing;

    const result = await bookmarkStore.save({
      id: 'bm-new',
      url: 'https://portal.azure.com/#resource/subscriptions/sub-1/resourceGroups/rg-new',
      tenantId: null,
      tenantName: 'contoso.onmicrosoft.com',
      resourceId: '/subscriptions/sub-1/resourceGroups/rg-new',
      displayName: 'rg-new',
      alias: null,
      stateDepth: 'full' as const,
      createdAt: 0,
      lastAccessed: 0,
      accessCount: 0,
      isStale: false,
    });

    expect(result).toEqual({ success: false, reason: 'limit_reached' });
    // Bookmark was NOT added
    expect(mockStorage['bookmarks']).toHaveLength(150);
  });

  it('allows updating an existing bookmark even at the limit', async () => {
    const existing = Array.from({ length: 150 }, (_, i) => ({
      id: `bm-${i}`,
      url: `https://portal.azure.com/#resource/subscriptions/sub-1/resourceGroups/rg-${i}`,
      tenantId: null,
      tenantName: 'contoso.onmicrosoft.com',
      resourceId: `/subscriptions/sub-1/resourceGroups/rg-${i}`,
      displayName: `rg-${i}`,
      alias: null,
      stateDepth: 'full' as const,
      createdAt: 0,
      lastAccessed: 0,
      accessCount: 0,
      isStale: false,
    }));
    mockStorage['bookmarks'] = existing;

    // Update existing bm-0 — should succeed
    const result = await bookmarkStore.save({ ...existing[0], alias: 'Updated' });

    expect(result).toEqual({ success: true, bookmark: expect.objectContaining({ id: 'bm-0', alias: 'Updated' }) });
  });

  it('allows saving when under the limit', async () => {
    mockStorage['bookmarks'] = [];

    const newBookmark = {
      id: 'bm-new',
      url: 'https://portal.azure.com/#resource/test',
      tenantId: null,
      tenantName: 'contoso.onmicrosoft.com',
      resourceId: '/subscriptions/sub-1/resourceGroups/rg-new',
      displayName: 'rg-new',
      alias: null,
      stateDepth: 'full' as const,
      createdAt: 0,
      lastAccessed: 0,
      accessCount: 0,
      isStale: false,
    };

    const result = await bookmarkStore.save(newBookmark);
    expect(result).toEqual({ success: true, bookmark: expect.objectContaining({ id: 'bm-new' }) });
    expect(mockStorage['bookmarks']).toHaveLength(1);
  });
});

function makeBookmark(id: string) {
  return {
    id,
    url: 'https://portal.azure.com/#resource/test',
    tenantId: null,
    tenantName: 'contoso.onmicrosoft.com',
    resourceId: `/subscriptions/sub-1/resourceGroups/${id}`,
    displayName: id,
    alias: null,
    stateDepth: 'full' as const,
    createdAt: 0, lastAccessed: 0, accessCount: 0, isStale: false,
  };
}

describe('bookmark sync routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
    Object.keys(mockSyncStorage).forEach(k => delete mockSyncStorage[k]);
  });

  it('reads from local storage when bookmarkSyncEnabled is false', async () => {
    vi.mocked(settingsStore.get).mockResolvedValueOnce({
      ...DEFAULT_SETTINGS,
      bookmarkSyncEnabled: false,
    });
    mockStorage['bookmarks'] = [makeBookmark('bm-local')];

    const result = await bookmarkStore.getAll();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('bm-local');
  });

  it('reads from sync storage when bookmarkSyncEnabled is true', async () => {
    vi.mocked(settingsStore.get).mockResolvedValueOnce({
      ...DEFAULT_SETTINGS,
      bookmarkSyncEnabled: true,
    });
    mockSyncStorage['bp_bm_bm-sync'] = makeBookmark('bm-sync');

    const result = await bookmarkStore.getAll();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('bm-sync');
  });

  it('writes to sync storage as per-item keys when bookmarkSyncEnabled is true', async () => {
    // save() calls settingsStore.get() twice: once in readBookmarks, once in writeBookmarks
    vi.mocked(settingsStore.get)
      .mockResolvedValueOnce({ ...DEFAULT_SETTINGS, bookmarkSyncEnabled: true })
      .mockResolvedValueOnce({ ...DEFAULT_SETTINGS, bookmarkSyncEnabled: true });

    await bookmarkStore.save(makeBookmark('bm-written'));

    expect(mockSyncStorage['bp_bm_bm-written']).toBeDefined();
    expect(mockSyncStorage['bp_bm_bm-written'].id).toBe('bm-written');
    expect(mockSyncStorage['bookmarks']).toBeUndefined();
  });
});

describe('migrateBookmarks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockStorage).forEach(key => delete mockStorage[key]);
  });

  it('should fix bookmarks with null tenantId when cache has the domain', async () => {
    const guid = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    mockStorage['tenantMapping'] = { 'contoso.onmicrosoft.com': guid };
    mockStorage['bookmarks'] = [{
      id: 'bm-null',
      url: 'https://portal.azure.com/#@contoso.onmicrosoft.com/resource/subscriptions/sub-1/resourceGroups/rg/providers/Microsoft.Web/sites/app',
      tenantId: null,
      tenantName: 'contoso.onmicrosoft.com',
      resourceId: '/subscriptions/sub-1/resourceGroups/rg/providers/Microsoft.Web/sites/app',
      displayName: 'app', alias: null, stateDepth: 'resource' as const,
      createdAt: 1000, lastAccessed: 1000, accessCount: 0, isStale: false,
    }];

    await migrateBookmarks();

    const bookmarks = mockStorage['bookmarks'] as any[];
    expect(bookmarks[0].tenantId).toBe(guid);
    // url should NOT contain the GUID — it stays canonical
    expect(bookmarks[0].url).not.toContain(guid);
  });

  it('should fix bookmarks with domain-string tenantId when cache has the domain', async () => {
    const guid = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    mockStorage['tenantMapping'] = { 'fabrikam.onmicrosoft.com': guid };
    mockStorage['bookmarks'] = [{
      id: 'bm-domain',
      url: 'https://portal.azure.com/#@fabrikam.onmicrosoft.com/resource/subscriptions/sub-2/resourceGroups/rg/providers/Microsoft.Web/sites/app',
      tenantId: 'fabrikam.onmicrosoft.com',
      tenantName: 'fabrikam.onmicrosoft.com',
      resourceId: '/subscriptions/sub-2/resourceGroups/rg/providers/Microsoft.Web/sites/app',
      displayName: 'app', alias: null, stateDepth: 'resource' as const,
      createdAt: 1000, lastAccessed: 1000, accessCount: 0, isStale: false,
    }];

    await migrateBookmarks();

    const bookmarks = mockStorage['bookmarks'] as any[];
    expect(bookmarks[0].tenantId).toBe(guid);
    // url should NOT contain the GUID — it stays canonical
    expect(bookmarks[0].url).not.toContain(guid);
  });

  it('should strip GUID from url when url already contains a GUID', async () => {
    const guid = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    mockStorage['tenantMapping'] = {};
    mockStorage['bookmarks'] = [{
      id: 'bm-guid-url',
      url: `https://portal.azure.com/${guid}/#@contoso.onmicrosoft.com/resource/subscriptions/sub-3`,
      tenantId: guid,
      tenantName: 'contoso.onmicrosoft.com',
      resourceId: '/subscriptions/sub-3',
      displayName: 'sub', alias: null, stateDepth: 'resource' as const,
      createdAt: 1000, lastAccessed: 1000, accessCount: 0, isStale: false,
    }];

    await migrateBookmarks();

    const bookmarks = mockStorage['bookmarks'] as any[];
    expect(bookmarks[0].tenantId).toBe(guid); // tenantId unchanged
    expect(bookmarks[0].url).not.toContain(guid); // GUID stripped from url
    expect(bookmarks[0].url).toBe('https://portal.azure.com/#@contoso.onmicrosoft.com/resource/subscriptions/sub-3');
  });

  it('should leave bookmarks with valid GUID tenantId and no GUID in url untouched', async () => {
    const guid = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    mockStorage['tenantMapping'] = {};
    mockStorage['bookmarks'] = [{
      id: 'bm-good',
      url: 'https://portal.azure.com/#@contoso.onmicrosoft.com/resource/subscriptions/sub-3',
      tenantId: guid,
      tenantName: 'contoso.onmicrosoft.com',
      resourceId: '/subscriptions/sub-3',
      displayName: 'sub', alias: null, stateDepth: 'resource' as const,
      createdAt: 1000, lastAccessed: 1000, accessCount: 0, isStale: false,
    }];

    await migrateBookmarks();

    const bookmarks = mockStorage['bookmarks'] as any[];
    expect(bookmarks[0].tenantId).toBe(guid); // unchanged
    expect(bookmarks[0].url).not.toContain(guid); // url was already clean
  });

  it('should leave bookmarks untouched when domain is not in cache', async () => {
    mockStorage['tenantMapping'] = {};
    mockStorage['bookmarks'] = [{
      id: 'bm-unknown',
      url: 'https://portal.azure.com/#@unknown.onmicrosoft.com/resource/subscriptions/sub-4',
      tenantId: null,
      tenantName: 'unknown.onmicrosoft.com',
      resourceId: '/subscriptions/sub-4',
      displayName: 'sub', alias: null, stateDepth: 'resource' as const,
      createdAt: 1000, lastAccessed: 1000, accessCount: 0, isStale: false,
    }];

    await migrateBookmarks();

    const bookmarks = mockStorage['bookmarks'] as any[];
    expect(bookmarks[0].tenantId).toBeNull(); // still null
  });

  it('should not write to storage when all bookmarks already have valid GUIDs and clean urls', async () => {
    const guid = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    // Non-empty mapping so we don't hit the early-exit guard
    mockStorage['tenantMapping'] = { 'contoso.onmicrosoft.com': 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' };
    // "Clean" bookmark: valid GUID tenantId, url has no GUID in path
    mockStorage['bookmarks'] = [{
      id: 'bm-clean2',
      url: 'https://portal.azure.com/#@contoso.onmicrosoft.com/resource/subscriptions/sub-6',
      tenantId: guid,
      tenantName: 'contoso.onmicrosoft.com',
      resourceId: '/subscriptions/sub-6',
      displayName: 'sub', alias: null, stateDepth: 'resource' as const,
      createdAt: 1000, lastAccessed: 1000, accessCount: 0, isStale: false,
    }];

    const { storageSet } = await import('../../shared/storage');
    vi.clearAllMocks();
    await migrateBookmarks();

    expect(vi.mocked(storageSet)).not.toHaveBeenCalled();
  });
});

describe('migrateBookmarksToSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
    Object.keys(mockSyncStorage).forEach(k => delete mockSyncStorage[k]);
  });

  it('copies local bookmarks to sync as per-item keys when sync is empty', async () => {
    mockStorage['bookmarks'] = [makeBookmark('bm-local')];

    await migrateBookmarksToSync();

    expect(mockSyncStorage['bp_bm_bm-local']).toBeDefined();
    expect(mockSyncStorage['bp_bm_bm-local'].id).toBe('bm-local');
    expect(mockSyncStorage['bookmarks']).toBeUndefined();
    expect(mockStorage['bookmarks']).toBeUndefined();
  });

  it('merges local into sync, deduplicating by resourceId:tenantName', async () => {
    const shared = {
      ...makeBookmark('bm-shared'),
      resourceId: '/subscriptions/sub-1/resourceGroups/shared',
      tenantName: 'contoso.onmicrosoft.com',
    };
    mockSyncStorage['bp_bm_bm-sync-version'] = { ...shared, id: 'bm-sync-version', alias: 'sync alias' };
    mockStorage['bookmarks'] = [
      { ...shared, id: 'bm-local-version', alias: 'local alias' }, // duplicate — should be dropped
      { ...makeBookmark('bm-local-only'), resourceId: '/subscriptions/sub-1/resourceGroups/local-only' },
    ];

    await migrateBookmarksToSync();

    const syncKeys = Object.keys(mockSyncStorage).filter(k => k.startsWith('bp_bm_'));
    expect(syncKeys).toHaveLength(2);
    // Sync version wins for the duplicate
    expect(mockSyncStorage['bp_bm_bm-sync-version']).toBeDefined();
    expect(mockSyncStorage['bp_bm_bm-sync-version'].alias).toBe('sync alias');
    expect(mockSyncStorage['bp_bm_bm-local-version']).toBeUndefined();
    // Local-only item was added
    expect(mockSyncStorage['bp_bm_bm-local-only']).toBeDefined();
    // Local storage cleared
    expect(mockStorage['bookmarks']).toBeUndefined();
  });

  it('preserves all sync bookmarks even when local is empty', async () => {
    mockSyncStorage['bp_bm_bm-sync-only'] = makeBookmark('bm-sync-only');
    mockStorage['bookmarks'] = [];

    await migrateBookmarksToSync();

    const syncKeys = Object.keys(mockSyncStorage).filter(k => k.startsWith('bp_bm_'));
    expect(syncKeys).toHaveLength(1);
    expect(mockSyncStorage['bp_bm_bm-sync-only']).toBeDefined();
  });

  it('migrates old single-key bookmarks in sync to per-item format', async () => {
    // User was on old version that stored all bookmarks under a single 'bookmarks' key
    mockSyncStorage['bookmarks'] = [makeBookmark('bm-old-format')];
    mockStorage['bookmarks'] = [];

    await migrateBookmarksToSync();

    // Converted to per-item
    expect(mockSyncStorage['bp_bm_bm-old-format']).toBeDefined();
    // Old single key removed
    expect(mockSyncStorage['bookmarks']).toBeUndefined();
  });
});

describe('migrateBookmarksFromSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
    Object.keys(mockSyncStorage).forEach(k => delete mockSyncStorage[k]);
  });

  it('copies sync bookmarks to local and clears per-item sync keys', async () => {
    mockSyncStorage['bp_bm_bm-sync'] = makeBookmark('bm-sync');

    await migrateBookmarksFromSync();

    expect(mockStorage['bookmarks']).toHaveLength(1);
    expect(mockStorage['bookmarks'][0].id).toBe('bm-sync');
    expect(mockSyncStorage['bp_bm_bm-sync']).toBeUndefined();
  });

  it('writes empty array to local when sync is empty', async () => {
    await migrateBookmarksFromSync();

    expect(mockStorage['bookmarks']).toEqual([]);
  });

  it('reads old single-key sync bookmarks and moves them to local', async () => {
    // User was on old version — bookmarks stored under single 'bookmarks' key in sync
    mockSyncStorage['bookmarks'] = [makeBookmark('bm-old-format')];

    await migrateBookmarksFromSync();

    expect(mockStorage['bookmarks']).toHaveLength(1);
    expect(mockStorage['bookmarks'][0].id).toBe('bm-old-format');
    expect(mockSyncStorage['bookmarks']).toBeUndefined();
  });
});
