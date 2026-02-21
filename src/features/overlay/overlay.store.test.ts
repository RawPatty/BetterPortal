import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HistoryEntry } from '../../shared/types';

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
      historyEnabled: true,
      historyRetentionDays: 30,
      historyMaxEntries: 500,
    })),
  },
}));

// Mock URL parser functions
vi.mock('../bookmarks/url-parser', () => ({
  parsePortalUrl: vi.fn((url: string) => ({
    tenantId: 'test-tenant',
    tenantDomain: 'test.onmicrosoft.com',
    resourceId: '/subscriptions/sub-123/resourceGroups/rg-test/providers/Microsoft.Web/sites/my-app',
    blade: null,
    fullUrl: url,
  })),
  extractDisplayName: vi.fn(() => 'my-app'),
  extractResourceName: vi.fn(() => 'my-app'),
  getTenantNameFromDOM: vi.fn(() => 'test.onmicrosoft.com'),
  getResourceNameFromDOM: vi.fn(() => 'my-app'),
  getCurrentDirectoryInfo: vi.fn(() => ({ domain: 'test.onmicrosoft.com', guid: null })),
  isSameDirectory: vi.fn(() => true),
  buildNavigationUrl: vi.fn((url: string) => url),
  stripBlade: vi.fn((url: string) => url),
}));

// Mock history store
vi.mock('../history/history.store', () => ({
  historyStore: {
    getRecent: vi.fn(() => Promise.resolve([])),
    delete: vi.fn(),
    deleteByResource: vi.fn(),
  },
}));

import { overlayActions, tenantAliases, filteredItems, bookmarks, searchQuery, currentDirectory, itemsByTenant } from './overlay.store';
import { storageGet, storageSet } from '../../shared/storage';
import { getCurrentDirectoryInfo } from '../bookmarks/url-parser';
import { get } from 'svelte/store';

describe('overlayActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear mock storage
    Object.keys(mockStorage).forEach(key => delete mockStorage[key]);
    mockStorage['bookmarks'] = [];
  });

  describe('saveHistoryItem', () => {
    it('should convert a history item to a bookmark', async () => {
      const historyEntry: HistoryEntry = {
        id: 'history-1',
        url: 'https://portal.azure.com/#@test.onmicrosoft.com/resource/subscriptions/sub-123/resourceGroups/rg-test/providers/Microsoft.Web/sites/my-app',
        tenantId: 'tenant-guid-123',
        tenantName: 'test.onmicrosoft.com',
        resourceId: '/subscriptions/sub-123/resourceGroups/rg-test/providers/Microsoft.Web/sites/my-app',
        displayName: 'my-app',
        visitedAt: Date.now(),
        visitCount: 5,
      };

      await overlayActions.saveHistoryItem(historyEntry);

      // Verify bookmark was saved
      expect(storageSet).toHaveBeenCalledWith('bookmarks', expect.any(Array));

      const savedBookmarks = mockStorage['bookmarks'];
      expect(savedBookmarks).toHaveLength(1);

      const bookmark = savedBookmarks[0];
      expect(bookmark).toMatchObject({
        url: historyEntry.url,
        tenantId: historyEntry.tenantId,
        tenantName: historyEntry.tenantName,
        resourceId: historyEntry.resourceId,
        displayName: historyEntry.displayName,
        alias: null,
        stateDepth: 'full',
        isStale: false,
      });

      // Verify it has required bookmark fields
      expect(bookmark.id).toBeDefined();
      expect(bookmark.createdAt).toBeDefined();
      expect(bookmark.lastAccessed).toBeDefined();
      expect(bookmark.accessCount).toBe(0);
    });

    it('should preserve all history entry properties when converting to bookmark', async () => {
      const historyEntry: HistoryEntry = {
        id: 'history-2',
        url: 'https://portal.azure.com/tenant-123/#@contoso.onmicrosoft.com/resource/subscriptions/sub-456/resourceGroups/rg-prod',
        tenantId: 'tenant-123',
        tenantName: 'contoso.onmicrosoft.com',
        resourceId: '/subscriptions/sub-456/resourceGroups/rg-prod',
        displayName: 'Production RG',
        visitedAt: Date.now() - 10000,
        visitCount: 10,
      };

      await overlayActions.saveHistoryItem(historyEntry);

      const savedBookmarks = mockStorage['bookmarks'];
      const bookmark = savedBookmarks[0];

      // Verify key properties are preserved
      expect(bookmark.url).toBe(historyEntry.url);
      expect(bookmark.tenantId).toBe(historyEntry.tenantId);
      expect(bookmark.tenantName).toBe(historyEntry.tenantName);
      expect(bookmark.resourceId).toBe(historyEntry.resourceId);
      expect(bookmark.displayName).toBe(historyEntry.displayName);
    });

    it('should generate a new unique ID for the bookmark', async () => {
      const historyEntry: HistoryEntry = {
        id: 'history-original-id',
        url: 'https://portal.azure.com/#resource',
        tenantId: 'tenant-1',
        tenantName: 'tenant.onmicrosoft.com',
        resourceId: '/subscriptions/sub-1',
        displayName: 'Test Resource',
        visitedAt: Date.now(),
        visitCount: 1,
      };

      await overlayActions.saveHistoryItem(historyEntry);

      const savedBookmarks = mockStorage['bookmarks'];
      const bookmark = savedBookmarks[0];

      // Bookmark should have a different ID than the history entry
      expect(bookmark.id).not.toBe(historyEntry.id);
      // Should be a valid UUID format
      expect(bookmark.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  });

  describe('renameBookmark', () => {
    it('should set alias on a bookmark', async () => {
      mockStorage['bookmarks'] = [{
        id: 'bm-1',
        url: 'https://portal.azure.com/#resource/test',
        tenantId: 'tenant-1',
        tenantName: 'test.onmicrosoft.com',
        resourceId: '/subscriptions/sub-1',
        displayName: 'Original Name',
        alias: null,
        stateDepth: 'full',
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        accessCount: 0,
        isStale: false,
      }];

      await overlayActions.renameBookmark('bm-1', 'My Custom Name');

      const saved = mockStorage['bookmarks'];
      expect(saved[0].alias).toBe('My Custom Name');
    });

    it('should clear alias when set to null', async () => {
      mockStorage['bookmarks'] = [{
        id: 'bm-1',
        url: 'https://portal.azure.com/#resource/test',
        tenantId: 'tenant-1',
        tenantName: 'test.onmicrosoft.com',
        resourceId: '/subscriptions/sub-1',
        displayName: 'Original Name',
        alias: 'Old Alias',
        stateDepth: 'full',
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        accessCount: 0,
        isStale: false,
      }];

      await overlayActions.renameBookmark('bm-1', null);

      const saved = mockStorage['bookmarks'];
      expect(saved[0].alias).toBe(null);
    });
  });

  describe('renameTenant', () => {
    it('should save a tenant alias', async () => {
      await overlayActions.renameTenant('contoso.onmicrosoft.com', 'Contoso Production');

      expect(storageSet).toHaveBeenCalledWith('tenantAliases', {
        'contoso.onmicrosoft.com': 'Contoso Production',
      });
      expect(get(tenantAliases)).toEqual({
        'contoso.onmicrosoft.com': 'Contoso Production',
      });
    });

    it('should remove a tenant alias when set to null', async () => {
      // Pre-populate with an existing alias
      tenantAliases.set({ 'contoso.onmicrosoft.com': 'Contoso Production' });

      await overlayActions.renameTenant('contoso.onmicrosoft.com', null);

      expect(storageSet).toHaveBeenCalledWith('tenantAliases', {});
      expect(get(tenantAliases)).toEqual({});
    });

    it('should preserve other tenant aliases when updating one', async () => {
      tenantAliases.set({ 'other.onmicrosoft.com': 'Other Tenant' });

      await overlayActions.renameTenant('contoso.onmicrosoft.com', 'Contoso');

      const result = get(tenantAliases);
      expect(result).toEqual({
        'other.onmicrosoft.com': 'Other Tenant',
        'contoso.onmicrosoft.com': 'Contoso',
      });
    });
  });

  describe('search with aliases', () => {
    it('should match items by tenant alias in search', () => {
      // Set up bookmarks with a tenant
      bookmarks.set([{
        id: 'bm-1',
        url: 'https://portal.azure.com/#resource/test',
        tenantId: 'tenant-1',
        tenantName: 'contoso.onmicrosoft.com',
        resourceId: '/subscriptions/sub-1',
        displayName: 'My App',
        alias: null,
        stateDepth: 'full' as const,
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        accessCount: 0,
        isStale: false,
      }]);

      // Set tenant alias
      tenantAliases.set({ 'contoso.onmicrosoft.com': 'Production Environment' });

      // Search by tenant alias
      searchQuery.set('Production');

      const items = get(filteredItems);
      expect(items).toHaveLength(1);
      expect(items[0].displayName).toBe('My App');

      // Clean up
      searchQuery.set('');
      bookmarks.set([]);
      tenantAliases.set({});
    });

    it('should match items by bookmark alias in search', () => {
      bookmarks.set([{
        id: 'bm-1',
        url: 'https://portal.azure.com/#resource/test',
        tenantId: 'tenant-1',
        tenantName: 'contoso.onmicrosoft.com',
        resourceId: '/subscriptions/sub-1',
        displayName: 'webapp-prod-eastus',
        alias: 'Main Production Site',
        stateDepth: 'full' as const,
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        accessCount: 0,
        isStale: false,
      }]);

      tenantAliases.set({});

      // Search by alias
      searchQuery.set('Main Production');

      const items = get(filteredItems);
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('bm-1');

      // Clean up
      searchQuery.set('');
      bookmarks.set([]);
    });
  });
});

// Helper to build a minimal bookmark for grouping tests
function makeBookmark(id: string, tenantName: string, tenantId: string | null, resourceSuffix: string) {
  return {
    id,
    url: `https://portal.azure.com/#resource/subscriptions/sub-1/resourceGroups/${resourceSuffix}`,
    tenantId,
    tenantName,
    resourceId: `/subscriptions/sub-1/resourceGroups/${resourceSuffix}`,
    displayName: resourceSuffix,
    alias: null as string | null,
    stateDepth: 'full' as const,
    createdAt: 0,
    lastAccessed: 0,
    accessCount: 0,
    isStale: false,
  };
}

describe('currentDirectory store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockStorage).forEach(key => delete mockStorage[key]);
    mockStorage['bookmarks'] = [];
    // Default mock: no GUID in URL
    vi.mocked(getCurrentDirectoryInfo).mockReturnValue({ domain: 'test.onmicrosoft.com', guid: null });
  });

  it('is populated with domain from getCurrentDirectoryInfo after refresh', async () => {
    vi.mocked(getCurrentDirectoryInfo).mockReturnValue({ domain: 'contoso.onmicrosoft.com', guid: null });

    await overlayActions.refresh();

    const dir = get(currentDirectory);
    expect(dir.domain).toBe('contoso.onmicrosoft.com');
  });

  it('is populated with GUID from getCurrentDirectoryInfo after refresh', async () => {
    vi.mocked(getCurrentDirectoryInfo).mockReturnValue({
      domain: 'contoso.onmicrosoft.com',
      guid: 'aabbccdd-1234-1234-1234-aabbccddeeff',
    });

    await overlayActions.refresh();

    const dir = get(currentDirectory);
    expect(dir.guid).toBe('aabbccdd-1234-1234-1234-aabbccddeeff');
  });

  it('preserves GUID even when the current tenant has a display alias', async () => {
    vi.mocked(getCurrentDirectoryInfo).mockReturnValue({
      domain: 'contoso.onmicrosoft.com',
      guid: 'aabbccdd-1234-1234-1234-aabbccddeeff',
    });
    tenantAliases.set({ 'contoso.onmicrosoft.com': 'My Company (renamed)' });

    await overlayActions.refresh();

    const dir = get(currentDirectory);
    // GUID must be present regardless of the alias
    expect(dir.guid).toBe('aabbccdd-1234-1234-1234-aabbccddeeff');
    expect(dir.domain).toBe('contoso.onmicrosoft.com');
  });

  it('has null GUID when the current URL has no tenant GUID in path', async () => {
    vi.mocked(getCurrentDirectoryInfo).mockReturnValue({ domain: 'contoso.onmicrosoft.com', guid: null });

    await overlayActions.refresh();

    const dir = get(currentDirectory);
    expect(dir.guid).toBeNull();
  });

  it('has null domain when the current URL has no tenant hash', async () => {
    vi.mocked(getCurrentDirectoryInfo).mockReturnValue({ domain: null, guid: null });

    await overlayActions.refresh();

    const dir = get(currentDirectory);
    expect(dir.domain).toBeNull();
  });

  it('updates currentDirectory when overlay is opened via open()', async () => {
    vi.mocked(getCurrentDirectoryInfo).mockReturnValue({
      domain: 'fabrikam.onmicrosoft.com',
      guid: '11111111-2222-3333-4444-555555555555',
    });

    await overlayActions.open();

    const dir = get(currentDirectory);
    expect(dir.domain).toBe('fabrikam.onmicrosoft.com');
    expect(dir.guid).toBe('11111111-2222-3333-4444-555555555555');
  });
});

describe('itemsByTenant grouping', () => {
  beforeEach(() => {
    bookmarks.set([]);
    tenantAliases.set({});
  });

  afterEach(() => {
    bookmarks.set([]);
    tenantAliases.set({});
  });

  it('groups items with the same tenantName into one group regardless of tenantId', () => {
    bookmarks.set([
      makeBookmark('bm-1', 'contoso.onmicrosoft.com', 'guid-1', 'rg-a'),
      makeBookmark('bm-2', 'contoso.onmicrosoft.com', null, 'rg-b'),
    ]);

    const groups = get(itemsByTenant);
    expect(groups.size).toBe(1);
    expect(groups.get('contoso.onmicrosoft.com')!.items).toHaveLength(2);
  });

  it('creates separate groups for items with different tenantNames', () => {
    bookmarks.set([
      makeBookmark('bm-1', 'contoso.onmicrosoft.com', 'guid-1', 'rg-a'),
      makeBookmark('bm-2', 'fabrikam.onmicrosoft.com', 'guid-2', 'rg-b'),
    ]);

    const groups = get(itemsByTenant);
    expect(groups.size).toBe(2);
    expect(groups.get('contoso.onmicrosoft.com')!.items).toHaveLength(1);
    expect(groups.get('fabrikam.onmicrosoft.com')!.items).toHaveLength(1);
  });

  it('uses tenant alias as displayName when an alias is set', () => {
    bookmarks.set([makeBookmark('bm-1', 'contoso.onmicrosoft.com', 'guid-1', 'rg-a')]);
    tenantAliases.set({ 'contoso.onmicrosoft.com': 'Contoso Corp' });

    const groups = get(itemsByTenant);
    expect(groups.get('contoso.onmicrosoft.com')!.displayName).toBe('Contoso Corp');
  });

  it('uses tenantName as displayName when no alias is set', () => {
    bookmarks.set([makeBookmark('bm-1', 'contoso.onmicrosoft.com', 'guid-1', 'rg-a')]);
    tenantAliases.set({});

    const groups = get(itemsByTenant);
    expect(groups.get('contoso.onmicrosoft.com')!.displayName).toBe('contoso.onmicrosoft.com');
  });

  it('does not change tenantName when alias is set (alias only affects displayName)', () => {
    bookmarks.set([makeBookmark('bm-1', 'contoso.onmicrosoft.com', 'guid-1', 'rg-a')]);
    tenantAliases.set({ 'contoso.onmicrosoft.com': 'Renamed' });

    const groups = get(itemsByTenant);
    const group = groups.get('contoso.onmicrosoft.com')!;
    expect(group.tenantName).toBe('contoso.onmicrosoft.com');
    expect(group.displayName).toBe('Renamed');
  });
});
