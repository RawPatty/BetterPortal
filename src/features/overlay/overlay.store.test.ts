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

import { overlayActions } from './overlay.store';
import { storageGet, storageSet } from '../../shared/storage';

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
});
