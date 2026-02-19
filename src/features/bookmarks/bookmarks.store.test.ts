import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock chrome.storage
const mockStorage: Record<string, any> = {};
vi.mock('../../shared/storage', () => ({
  storageGet: vi.fn((key: string) => Promise.resolve(mockStorage[key])),
  storageSet: vi.fn((key: string, value: any) => {
    mockStorage[key] = value;
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
  getCurrentDirectoryInfo: vi.fn(() => ({ domain: 'contoso.onmicrosoft.com', guid: null })),
  isSameDirectory: vi.fn(() => true),
}));

// Mock crypto.randomUUID
vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'mock-uuid-' + Math.random().toString(36).slice(2, 8)) });

// Mock window.location
const mockLocation = { href: 'https://portal.azure.com/#@contoso.onmicrosoft.com/resource/subscriptions/sub-123' };
vi.stubGlobal('window', { location: mockLocation });

import { bookmarkStore, migrateBookmarks } from './bookmarks.store';
import { parsePortalUrl, getTenantGuidFromPortal } from './url-parser';

describe('bookmarkStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockStorage).forEach(key => delete mockStorage[key]);
    mockLocation.href = 'https://portal.azure.com/#@contoso.onmicrosoft.com/resource/subscriptions/sub-123';
  });

  describe('tenant GUID fallbacks at save time', () => {
    it('should use getTenantGuidFromPortal when URL has no GUID', async () => {
      const mockGuid = '99999999-9999-9999-9999-999999999999';
      vi.mocked(getTenantGuidFromPortal).mockReturnValueOnce(mockGuid);

      const bookmark = await bookmarkStore.saveCurrentPage();

      expect(bookmark.tenantId).toBe(mockGuid);
    });

    it('should use cached mapping when no URL GUID and no page context', async () => {
      mockStorage['tenantMapping'] = {
        'contoso.onmicrosoft.com': '88888888-8888-8888-8888-888888888888',
      };
      vi.mocked(getTenantGuidFromPortal).mockReturnValueOnce(null);

      const bookmark = await bookmarkStore.saveCurrentPage();

      expect(bookmark.tenantId).toBe('88888888-8888-8888-8888-888888888888');
    });

    it('should leave tenantId null when no source has a GUID', async () => {
      vi.mocked(getTenantGuidFromPortal).mockReturnValueOnce(null);
      vi.mocked(parsePortalUrl).mockReturnValueOnce({
        tenantId: null,
        tenantDomain: 'unknown-domain.onmicrosoft.com',
        resourceId: '/subscriptions/sub-789/resourceGroups/rg-test/providers/Microsoft.Web/sites/app3',
        blade: null,
        fullUrl: 'https://portal.azure.com/#@unknown-domain.onmicrosoft.com/resource/subscriptions/sub-789',
      } as any);

      // Override DOM to return a non-cached domain
      const { getTenantNameFromDOM } = await import('./url-parser');
      vi.mocked(getTenantNameFromDOM).mockReturnValueOnce('unknown-domain.onmicrosoft.com');

      const bookmark = await bookmarkStore.saveCurrentPage();

      expect(bookmark.tenantId).toBeNull();
    });

    it('should prefer URL GUID over other sources', async () => {
      const urlGuid = '11111111-1111-1111-1111-111111111111';
      const pageGuid = '22222222-2222-2222-2222-222222222222';

      vi.mocked(parsePortalUrl).mockReturnValueOnce({
        tenantId: urlGuid,
        tenantDomain: 'contoso.onmicrosoft.com',
        resourceId: '/subscriptions/sub-123/resourceGroups/rg-test/providers/Microsoft.Web/sites/my-app',
        blade: null,
        fullUrl: `https://portal.azure.com/${urlGuid}/#@contoso.onmicrosoft.com/resource/subscriptions/sub-123`,
      } as any);
      vi.mocked(getTenantGuidFromPortal).mockReturnValueOnce(pageGuid);

      const bookmark = await bookmarkStore.saveCurrentPage();

      expect(bookmark.tenantId).toBe(urlGuid);
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

    it('should update URL with GUID during backfill', async () => {
      const guid = '66666666-6666-6666-6666-666666666666';
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
          url: 'https://portal.azure.com/#@contoso.onmicrosoft.com/resource/sub/url-test',
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
      expect(backfilled.url).toContain(guid);
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
      expect(fixed.url).toContain(domainGuid);
    });
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
    expect(bookmarks[0].url).toContain(guid);
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
    expect(bookmarks[0].url).toContain(guid);
  });

  it('should leave bookmarks with valid GUID tenantId untouched', async () => {
    const guid = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    mockStorage['tenantMapping'] = { 'contoso.onmicrosoft.com': 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' };
    mockStorage['bookmarks'] = [{
      id: 'bm-good',
      url: `https://portal.azure.com/${guid}/#@contoso.onmicrosoft.com/resource/subscriptions/sub-3`,
      tenantId: guid,
      tenantName: 'contoso.onmicrosoft.com',
      resourceId: '/subscriptions/sub-3',
      displayName: 'sub', alias: null, stateDepth: 'resource' as const,
      createdAt: 1000, lastAccessed: 1000, accessCount: 0, isStale: false,
    }];

    await migrateBookmarks();

    const bookmarks = mockStorage['bookmarks'] as any[];
    expect(bookmarks[0].tenantId).toBe(guid); // unchanged
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

  it('should not write to storage when no bookmarks need fixing', async () => {
    const guid = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    mockStorage['tenantMapping'] = {};
    mockStorage['bookmarks'] = [{
      id: 'bm-clean',
      url: `https://portal.azure.com/${guid}/#@contoso.onmicrosoft.com/resource/subscriptions/sub-5`,
      tenantId: guid,
      tenantName: 'contoso.onmicrosoft.com',
      resourceId: '/subscriptions/sub-5',
      displayName: 'sub', alias: null, stateDepth: 'resource' as const,
      createdAt: 1000, lastAccessed: 1000, accessCount: 0, isStale: false,
    }];

    const { storageSet } = await import('../../shared/storage');
    vi.clearAllMocks();
    await migrateBookmarks();

    expect(vi.mocked(storageSet)).not.toHaveBeenCalled();
  });

  it('should not write to storage when all bookmarks already have valid GUIDs', async () => {
    const guid = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    // Non-empty mapping so we don't hit the early-exit guard
    mockStorage['tenantMapping'] = { 'contoso.onmicrosoft.com': 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' };
    mockStorage['bookmarks'] = [{
      id: 'bm-clean2',
      url: `https://portal.azure.com/${guid}/#@contoso.onmicrosoft.com/resource/subscriptions/sub-6`,
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
