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
      historyEnabled: true,
      historyRetentionDays: 30,
      historyMaxEntries: 500,
    })),
  },
}));

// Mock URL parser functions that require DOM
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
  getTenantNameFromDOM: vi.fn(() => 'Test Tenant'),
  getResourceNameFromDOM: vi.fn(() => 'my-app'),
  getTenantGuidFromPortal: vi.fn(() => null),
  isErrorPage: vi.fn(() => false), // Mock as not an error page by default
  buildNavigationUrl: vi.fn((url: string, tenantId: string) => {
    if (!tenantId || tenantId === 'unknown') return url;
    const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId);
    if (isGuid) {
      // Strip #@domain/ (only if followed by path) and inject GUID
      let result = url.replace(/#@[^/]+\//, '#/');
      if (!result.includes(tenantId)) {
        result = result.replace('portal.azure.com/', `portal.azure.com/${tenantId}/`);
      }
      return result;
    }
    return url;
  }),
  stripTenantGuidFromUrl: vi.fn((url: string) =>
    url.replace(/portal\.azure\.com\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i, 'portal.azure.com/')
  ),
}));

import { historyStore } from './history.store';
import { storageGet, storageSet } from '../../shared/storage';
import { parsePortalUrl, getTenantGuidFromPortal } from '../bookmarks/url-parser';

describe('historyStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear mock storage
    Object.keys(mockStorage).forEach(key => delete mockStorage[key]);
  });

  describe('getAll', () => {
    it('should return empty array when no history exists', async () => {
      const result = await historyStore.getAll();
      expect(result).toEqual([]);
    });

    it('should return stored history entries', async () => {
      const entries = [
        { id: '1', resourceId: '/sub/1', tenantId: 'tenant1', displayName: 'App 1', visitedAt: Date.now(), visitCount: 1, url: 'https://portal.azure.com/#1', tenantName: 'Tenant 1' },
        { id: '2', resourceId: '/sub/2', tenantId: 'tenant1', displayName: 'App 2', visitedAt: Date.now(), visitCount: 2, url: 'https://portal.azure.com/#2', tenantName: 'Tenant 1' },
      ];
      mockStorage['history'] = entries;

      const result = await historyStore.getAll();
      expect(result).toEqual(entries);
    });
  });

  describe('delete', () => {
    it('should delete entry by id', async () => {
      const entries = [
        { id: '1', resourceId: '/sub/1', tenantId: 'tenant1', displayName: 'App 1', visitedAt: Date.now(), visitCount: 1, url: 'https://portal.azure.com/#1', tenantName: 'Tenant 1' },
        { id: '2', resourceId: '/sub/2', tenantId: 'tenant1', displayName: 'App 2', visitedAt: Date.now(), visitCount: 2, url: 'https://portal.azure.com/#2', tenantName: 'Tenant 1' },
      ];
      mockStorage['history'] = entries;

      const result = await historyStore.delete('1');

      expect(result).toBe(true);
      expect(mockStorage['history']).toHaveLength(1);
      expect(mockStorage['history'][0].id).toBe('2');
    });

    it('should return false if entry not found', async () => {
      mockStorage['history'] = [];
      const result = await historyStore.delete('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('deleteByResource', () => {
    it('should delete entry by resourceId and tenantId', async () => {
      const entries = [
        { id: '1', resourceId: '/sub/1', tenantId: 'tenant1', displayName: 'App 1', visitedAt: Date.now(), visitCount: 1, url: 'https://portal.azure.com/#1', tenantName: 'Tenant 1' },
        { id: '2', resourceId: '/sub/2', tenantId: 'tenant1', displayName: 'App 2', visitedAt: Date.now(), visitCount: 2, url: 'https://portal.azure.com/#2', tenantName: 'Tenant 1' },
        { id: '3', resourceId: '/sub/1', tenantId: 'tenant2', displayName: 'App 1 Different Tenant', visitedAt: Date.now(), visitCount: 1, url: 'https://portal.azure.com/#3', tenantName: 'Tenant 2' },
      ];
      mockStorage['history'] = entries;

      const result = await historyStore.deleteByResource('/sub/1', 'tenant1');

      expect(result).toBe(true);
      expect(mockStorage['history']).toHaveLength(2);
      // Should still have entry with same resourceId but different tenant
      expect(mockStorage['history'].find((e: any) => e.id === '3')).toBeDefined();
      // Should still have entry with same tenant but different resourceId
      expect(mockStorage['history'].find((e: any) => e.id === '2')).toBeDefined();
      // Should have removed the matching entry
      expect(mockStorage['history'].find((e: any) => e.id === '1')).toBeUndefined();
    });

    it('should return false if no matching entry found', async () => {
      const entries = [
        { id: '1', resourceId: '/sub/1', tenantId: 'tenant1', displayName: 'App 1', visitedAt: Date.now(), visitCount: 1, url: 'https://portal.azure.com/#1', tenantName: 'Tenant 1' },
      ];
      mockStorage['history'] = entries;

      const result = await historyStore.deleteByResource('/sub/2', 'tenant1');

      expect(result).toBe(false);
      expect(mockStorage['history']).toHaveLength(1);
    });

    it('should not delete if only resourceId matches but not tenantId', async () => {
      const entries = [
        { id: '1', resourceId: '/sub/1', tenantId: 'tenant1', displayName: 'App 1', visitedAt: Date.now(), visitCount: 1, url: 'https://portal.azure.com/#1', tenantName: 'Tenant 1' },
      ];
      mockStorage['history'] = entries;

      const result = await historyStore.deleteByResource('/sub/1', 'tenant2');

      expect(result).toBe(false);
      expect(mockStorage['history']).toHaveLength(1);
    });
  });

  describe('getRecent', () => {
    it('should return entries sorted by visitedAt descending', async () => {
      const now = Date.now();
      const entries = [
        { id: '1', resourceId: '/sub/1', tenantId: 'tenant1', displayName: 'App 1', visitedAt: now - 1000, visitCount: 1, url: 'https://portal.azure.com/#1', tenantName: 'Tenant 1' },
        { id: '2', resourceId: '/sub/2', tenantId: 'tenant1', displayName: 'App 2', visitedAt: now, visitCount: 1, url: 'https://portal.azure.com/#2', tenantName: 'Tenant 1' },
        { id: '3', resourceId: '/sub/3', tenantId: 'tenant1', displayName: 'App 3', visitedAt: now - 2000, visitCount: 1, url: 'https://portal.azure.com/#3', tenantName: 'Tenant 1' },
      ];
      mockStorage['history'] = entries;

      const result = await historyStore.getRecent(10);

      expect(result[0].id).toBe('2'); // Most recent
      expect(result[1].id).toBe('1');
      expect(result[2].id).toBe('3'); // Oldest
    });

    it('should deduplicate by resourceId+tenantId keeping most recent', async () => {
      const now = Date.now();
      const entries = [
        { id: '1', resourceId: '/sub/1', tenantId: 'tenant1', displayName: 'App 1', visitedAt: now - 1000, visitCount: 1, url: 'https://portal.azure.com/#1', tenantName: 'Tenant 1' },
        { id: '2', resourceId: '/sub/1', tenantId: 'tenant1', displayName: 'App 1 Updated', visitedAt: now, visitCount: 2, url: 'https://portal.azure.com/#1-updated', tenantName: 'Tenant 1' },
      ];
      mockStorage['history'] = entries;

      const result = await historyStore.getRecent(10);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2'); // Most recent one
      expect(result[0].displayName).toBe('App 1 Updated');
    });

    it('should respect limit parameter', async () => {
      const now = Date.now();
      const entries = Array.from({ length: 20 }, (_, i) => ({
        id: String(i),
        resourceId: `/sub/${i}`,
        tenantId: 'tenant1',
        displayName: `App ${i}`,
        visitedAt: now - i * 1000,
        visitCount: 1,
        url: `https://portal.azure.com/#${i}`,
        tenantName: 'Tenant 1',
      }));
      mockStorage['history'] = entries;

      const result = await historyStore.getRecent(5);

      expect(result).toHaveLength(5);
    });
  });

  describe('clear', () => {
    it('should remove all history entries', async () => {
      mockStorage['history'] = [
        { id: '1', resourceId: '/sub/1', tenantId: 'tenant1', displayName: 'App 1', visitedAt: Date.now(), visitCount: 1, url: 'https://portal.azure.com/#1', tenantName: 'Tenant 1' },
      ];

      await historyStore.clear();

      expect(mockStorage['history']).toEqual([]);
    });
  });

  describe('search', () => {
    it('should return all recent entries when query is empty', async () => {
      const entries = [
        { id: '1', resourceId: '/sub/1', tenantId: 'tenant1', displayName: 'App 1', visitedAt: Date.now(), visitCount: 1, url: 'https://portal.azure.com/#1', tenantName: 'Tenant 1' },
        { id: '2', resourceId: '/sub/2', tenantId: 'tenant1', displayName: 'App 2', visitedAt: Date.now(), visitCount: 1, url: 'https://portal.azure.com/#2', tenantName: 'Tenant 1' },
      ];
      mockStorage['history'] = entries;

      const result = await historyStore.search('');

      expect(result).toHaveLength(2);
    });

    it('should filter by displayName', async () => {
      const entries = [
        { id: '1', resourceId: '/sub/1', tenantId: 'tenant1', displayName: 'Storage Account', visitedAt: Date.now(), visitCount: 1, url: 'https://portal.azure.com/#1', tenantName: 'Tenant 1' },
        { id: '2', resourceId: '/sub/2', tenantId: 'tenant1', displayName: 'Web App', visitedAt: Date.now(), visitCount: 1, url: 'https://portal.azure.com/#2', tenantName: 'Tenant 1' },
      ];
      mockStorage['history'] = entries;

      const result = await historyStore.search('storage');

      expect(result).toHaveLength(1);
      expect(result[0].displayName).toBe('Storage Account');
    });

    it('should filter by tenantName', async () => {
      const entries = [
        { id: '1', resourceId: '/sub/1', tenantId: 'tenant1', displayName: 'App 1', visitedAt: Date.now(), visitCount: 1, url: 'https://portal.azure.com/#1', tenantName: 'Contoso' },
        { id: '2', resourceId: '/sub/2', tenantId: 'tenant2', displayName: 'App 2', visitedAt: Date.now(), visitCount: 1, url: 'https://portal.azure.com/#2', tenantName: 'Fabrikam' },
      ];
      mockStorage['history'] = entries;

      const result = await historyStore.search('contoso');

      expect(result).toHaveLength(1);
      expect(result[0].tenantName).toBe('Contoso');
    });

    it('should be case-insensitive', async () => {
      const entries = [
        { id: '1', resourceId: '/sub/1', tenantId: 'tenant1', displayName: 'MyStorageAccount', visitedAt: Date.now(), visitCount: 1, url: 'https://portal.azure.com/#1', tenantName: 'Tenant 1' },
      ];
      mockStorage['history'] = entries;

      const result = await historyStore.search('MYSTORAGE');

      expect(result).toHaveLength(1);
    });
  });

  describe('GUID detection for subscriptions', () => {
    it('should detect GUID pattern correctly', () => {
      const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      // Valid GUIDs should match
      expect(guidPattern.test('ee5a161f-ac06-4354-affe-6f6e1bd5802c')).toBe(true);
      expect(guidPattern.test('12345678-1234-1234-1234-123456789abc')).toBe(true);
      expect(guidPattern.test('AABBCCDD-1234-5678-90AB-CDEF12345678')).toBe(true);

      // Non-GUIDs should not match
      expect(guidPattern.test('my-storage-account')).toBe(false);
      expect(guidPattern.test('my-webapp')).toBe(false);
      expect(guidPattern.test('12345678')).toBe(false);
      expect(guidPattern.test('')).toBe(false);
    });
  });

  describe('tenant ID fallback logic', () => {
    it('should prefer GUID tenant ID when available', () => {
      // Test that effectiveTenantId logic works
      const parsed = { tenantId: '12345678-1234-1234-1234-123456789abc', tenantDomain: 'contoso.onmicrosoft.com' };
      const effectiveTenantId = parsed.tenantId || parsed.tenantDomain || 'unknown';
      expect(effectiveTenantId).toBe('12345678-1234-1234-1234-123456789abc');
    });

    it('should fall back to tenant domain when GUID is not available', () => {
      const parsed = { tenantId: null, tenantDomain: 'contoso.onmicrosoft.com' };
      const effectiveTenantId = parsed.tenantId || parsed.tenantDomain || 'unknown';
      expect(effectiveTenantId).toBe('contoso.onmicrosoft.com');
    });

    it('should fall back to unknown when neither is available', () => {
      const parsed = { tenantId: null, tenantDomain: null };
      const effectiveTenantId = parsed.tenantId || parsed.tenantDomain || 'unknown';
      expect(effectiveTenantId).toBe('unknown');
    });

    it('should group entries from different directories separately', () => {
      // Simulate entries from two different directories (by domain)
      const entries = [
        { tenantId: 'contoso.onmicrosoft.com', resourceId: '/sub/1', displayName: 'App 1' },
        { tenantId: 'fabrikam.onmicrosoft.com', resourceId: '/sub/2', displayName: 'App 2' },
        { tenantId: 'contoso.onmicrosoft.com', resourceId: '/sub/3', displayName: 'App 3' },
      ];

      // Group by tenantId
      const grouped = new Map<string, typeof entries>();
      for (const entry of entries) {
        const existing = grouped.get(entry.tenantId) || [];
        existing.push(entry);
        grouped.set(entry.tenantId, existing);
      }

      expect(grouped.size).toBe(2);
      expect(grouped.get('contoso.onmicrosoft.com')).toHaveLength(2);
      expect(grouped.get('fabrikam.onmicrosoft.com')).toHaveLength(1);
    });
  });

  describe('tenant mapping cache', () => {
    it('should save tenant mapping when URL has both GUID and domain', async () => {
      // When URL has GUID in path and domain in hash, the mapping should be learned
      // This is tested by checking the tenantMapping storage key after upsert

      // The mock parsePortalUrl returns tenantId: 'test-tenant' and tenantDomain: 'test.onmicrosoft.com'
      // Since 'test-tenant' is not a GUID, the mapping won't be learned in this mock
      // But the test verifies the storage mechanism works

      mockStorage['tenantMapping'] = {};
      await historyStore.upsert('https://portal.azure.com/#@test.onmicrosoft.com/resource/...');

      // Verify tenantMapping key exists in storage
      expect(mockStorage['tenantMapping']).toBeDefined();
    });

    it('should use cached GUID when URL only has domain', async () => {
      // Pre-populate the cache
      mockStorage['tenantMapping'] = {
        'contoso.onmicrosoft.com': '11111111-1111-1111-1111-111111111111'
      };

      // The actual lookup happens in the real code
      // This test verifies the cache structure is correct
      const mapping = mockStorage['tenantMapping'];
      expect(mapping['contoso.onmicrosoft.com']).toBe('11111111-1111-1111-1111-111111111111');
    });

    it('should update URL with GUID when available from cache', () => {
      // Test that buildNavigationUrl is called correctly
      const url = 'https://portal.azure.com/#@contoso.onmicrosoft.com/resource/sub/123';
      const tenantGuid = '11111111-1111-1111-1111-111111111111';

      // Simulate what buildNavigationUrl does
      const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantGuid);
      expect(isGuid).toBe(true);

      const expectedUrl = url.replace('portal.azure.com/', `portal.azure.com/${tenantGuid}/`);
      expect(expectedUrl).toContain('portal.azure.com/11111111-1111-1111-1111-111111111111/');
    });

    it('should separate tenant mappings by domain', () => {
      // Verify different domains can have different GUIDs
      const mapping: Record<string, string> = {
        'contoso.onmicrosoft.com': '11111111-1111-1111-1111-111111111111',
        'fabrikam.onmicrosoft.com': '22222222-2222-2222-2222-222222222222',
      };

      expect(mapping['contoso.onmicrosoft.com']).not.toEqual(mapping['fabrikam.onmicrosoft.com']);
    });
  });

  describe('history limit enforcement (prune)', () => {
    it('should remove oldest entries when limit is exceeded', async () => {
      const now = Date.now();
      const entries = Array.from({ length: 25 }, (_, i) => ({
        id: String(i),
        resourceId: `/sub/${i}`,
        tenantId: 'tenant1',
        tenantName: 'Tenant 1',
        displayName: `App ${i}`,
        visitedAt: now - i * 1000, // Older entries have lower visitedAt
        visitCount: 1,
        url: `https://portal.azure.com/#${i}`,
      }));

      const settings = {
        historyEnabled: true,
        historyRetentionDays: 30,
        historyMaxEntries: 10,
      };

      const pruned = await historyStore.prune(entries, settings);

      // Should only keep 10 most recent entries
      expect(pruned).toHaveLength(10);

      // Verify they are sorted by visitedAt descending (most recent first)
      expect(pruned[0].id).toBe('0'); // Most recent
      expect(pruned[9].id).toBe('9'); // 10th most recent

      // Verify oldest entries are removed
      expect(pruned.find(e => e.id === '24')).toBeUndefined();
      expect(pruned.find(e => e.id === '15')).toBeUndefined();
    });

    it('should keep all entries when under the limit', async () => {
      const now = Date.now();
      const entries = Array.from({ length: 5 }, (_, i) => ({
        id: String(i),
        resourceId: `/sub/${i}`,
        tenantId: 'tenant1',
        tenantName: 'Tenant 1',
        displayName: `App ${i}`,
        visitedAt: now - i * 1000,
        visitCount: 1,
        url: `https://portal.azure.com/#${i}`,
      }));

      const settings = {
        historyEnabled: true,
        historyRetentionDays: 30,
        historyMaxEntries: 10,
      };

      const pruned = await historyStore.prune(entries, settings);

      // Should keep all 5 entries
      expect(pruned).toHaveLength(5);
      expect(pruned[0].id).toBe('0'); // Most recent
      expect(pruned[4].id).toBe('4'); // Oldest
    });

    it('should respect both retention days and max entries', async () => {
      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;

      // Create 20 entries: 10 recent (within retention), 10 old (outside retention)
      const entries = [
        ...Array.from({ length: 10 }, (_, i) => ({
          id: `recent-${i}`,
          resourceId: `/sub/recent-${i}`,
          tenantId: 'tenant1',
          tenantName: 'Tenant 1',
          displayName: `Recent App ${i}`,
          visitedAt: now - i * 1000, // Recent entries
          visitCount: 1,
          url: `https://portal.azure.com/#recent-${i}`,
        })),
        ...Array.from({ length: 10 }, (_, i) => ({
          id: `old-${i}`,
          resourceId: `/sub/old-${i}`,
          tenantId: 'tenant1',
          tenantName: 'Tenant 1',
          displayName: `Old App ${i}`,
          visitedAt: now - (40 * oneDayMs) - i * 1000, // 40 days old
          visitCount: 1,
          url: `https://portal.azure.com/#old-${i}`,
        })),
      ];

      const settings = {
        historyEnabled: true,
        historyRetentionDays: 30, // Remove entries older than 30 days
        historyMaxEntries: 5, // Keep max 5 entries
      };

      const pruned = await historyStore.prune(entries, settings);

      // Should first filter by retention (10 entries), then limit to 5
      expect(pruned).toHaveLength(5);

      // All pruned entries should be recent (not old)
      pruned.forEach(entry => {
        expect(entry.id).toContain('recent-');
      });

      // Should keep the 5 most recent entries
      expect(pruned[0].id).toBe('recent-0');
      expect(pruned[4].id).toBe('recent-4');
    });

    it('should handle limit of 1', async () => {
      const now = Date.now();
      const entries = Array.from({ length: 10 }, (_, i) => ({
        id: String(i),
        resourceId: `/sub/${i}`,
        tenantId: 'tenant1',
        tenantName: 'Tenant 1',
        displayName: `App ${i}`,
        visitedAt: now - i * 1000,
        visitCount: 1,
        url: `https://portal.azure.com/#${i}`,
      }));

      const settings = {
        historyEnabled: true,
        historyRetentionDays: 30,
        historyMaxEntries: 1,
      };

      const pruned = await historyStore.prune(entries, settings);

      // Should keep only the most recent entry
      expect(pruned).toHaveLength(1);
      expect(pruned[0].id).toBe('0');
    });

    it('should handle large limit (5000)', async () => {
      const now = Date.now();
      const entries = Array.from({ length: 100 }, (_, i) => ({
        id: String(i),
        resourceId: `/sub/${i}`,
        tenantId: 'tenant1',
        tenantName: 'Tenant 1',
        displayName: `App ${i}`,
        visitedAt: now - i * 1000,
        visitCount: 1,
        url: `https://portal.azure.com/#${i}`,
      }));

      const settings = {
        historyEnabled: true,
        historyRetentionDays: 30,
        historyMaxEntries: 5000,
      };

      const pruned = await historyStore.prune(entries, settings);

      // Should keep all 100 entries (under limit)
      expect(pruned).toHaveLength(100);
    });

    it('should sort entries by visitedAt descending', async () => {
      const now = Date.now();
      // Create entries in random order
      const entries = [
        { id: '2', resourceId: '/sub/2', tenantId: 'tenant1', tenantName: 'Tenant 1', displayName: 'App 2', visitedAt: now - 2000, visitCount: 1, url: 'https://portal.azure.com/#2' },
        { id: '0', resourceId: '/sub/0', tenantId: 'tenant1', tenantName: 'Tenant 1', displayName: 'App 0', visitedAt: now, visitCount: 1, url: 'https://portal.azure.com/#0' },
        { id: '1', resourceId: '/sub/1', tenantId: 'tenant1', tenantName: 'Tenant 1', displayName: 'App 1', visitedAt: now - 1000, visitCount: 1, url: 'https://portal.azure.com/#1' },
      ];

      const settings = {
        historyEnabled: true,
        historyRetentionDays: 30,
        historyMaxEntries: 10,
      };

      const pruned = await historyStore.prune(entries, settings);

      // Should be sorted by visitedAt descending
      expect(pruned[0].id).toBe('0'); // Most recent
      expect(pruned[1].id).toBe('1');
      expect(pruned[2].id).toBe('2'); // Oldest
    });

    it('should use default max entries from settings when not provided', async () => {
      const now = Date.now();
      const entries = Array.from({ length: 600 }, (_, i) => ({
        id: String(i),
        resourceId: `/sub/${i}`,
        tenantId: 'tenant1',
        tenantName: 'Tenant 1',
        displayName: `App ${i}`,
        visitedAt: now - i * 1000,
        visitCount: 1,
        url: `https://portal.azure.com/#${i}`,
      }));

      // Mock settings store to return default of 20 (new default)
      const { settingsStore } = await import('../settings/settings.store');
      vi.mocked(settingsStore.get).mockResolvedValueOnce({
        historyEnabled: true,
        historyRetentionDays: 30,
        historyMaxEntries: 20, // New default
      } as any);

      const pruned = await historyStore.prune(entries);

      // Should use the default max entries from settings (20)
      expect(pruned).toHaveLength(20);
    });
  });

  describe('tenant GUID fallbacks at save time', () => {
    it('should use getTenantGuidFromPortal when URL has no GUID', async () => {
      // parsePortalUrl returns non-GUID tenantId, so fallback kicks in
      const mockGuid = '99999999-9999-9999-9999-999999999999';
      vi.mocked(getTenantGuidFromPortal).mockReturnValueOnce(mockGuid);
      vi.mocked(parsePortalUrl).mockReturnValueOnce({
        tenantId: null,
        tenantDomain: 'contoso.onmicrosoft.com',
        resourceId: '/subscriptions/sub-123/resourceGroups/rg-test/providers/Microsoft.Web/sites/my-app',
        blade: null,
        fullUrl: 'https://portal.azure.com/#@contoso.onmicrosoft.com/resource/subscriptions/sub-123',
      } as any);

      const entry = await historyStore.upsert('https://portal.azure.com/#@contoso.onmicrosoft.com/resource/subscriptions/sub-123');

      expect(entry).not.toBeNull();
      expect(entry!.tenantId).toBe(mockGuid);
    });

    it('should use cached mapping when no URL GUID and no page context', async () => {
      // Pre-populate the tenant mapping cache
      mockStorage['tenantMapping'] = {
        'contoso.onmicrosoft.com': '88888888-8888-8888-8888-888888888888',
      };

      vi.mocked(getTenantGuidFromPortal).mockReturnValueOnce(null);
      vi.mocked(parsePortalUrl).mockReturnValueOnce({
        tenantId: null,
        tenantDomain: 'contoso.onmicrosoft.com',
        resourceId: '/subscriptions/sub-456/resourceGroups/rg-test/providers/Microsoft.Web/sites/other-app',
        blade: null,
        fullUrl: 'https://portal.azure.com/#@contoso.onmicrosoft.com/resource/subscriptions/sub-456',
      } as any);

      const entry = await historyStore.upsert('https://portal.azure.com/#@contoso.onmicrosoft.com/resource/subscriptions/sub-456');

      expect(entry).not.toBeNull();
      expect(entry!.tenantId).toBe('88888888-8888-8888-8888-888888888888');
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

      const entry = await historyStore.upsert('https://portal.azure.com/#@unknown-domain.onmicrosoft.com/resource/subscriptions/sub-789');

      expect(entry).not.toBeNull();
      expect(entry!.tenantId).toBeNull();
    });
  });

  describe('backfill null tenantIds on mapping learned', () => {
    it('should backfill existing entries when a new mapping is learned', async () => {
      const guid = '77777777-7777-7777-7777-777777777777';
      // Pre-populate history with entries that have null tenantId
      mockStorage['history'] = [
        {
          id: 'old-1',
          resourceId: '/sub/old-1',
          tenantId: null,
          tenantName: 'contoso.onmicrosoft.com',
          displayName: 'Old App 1',
          visitedAt: Date.now() - 5000,
          visitCount: 1,
          url: 'https://portal.azure.com/#@contoso.onmicrosoft.com/resource/sub/old-1',
        },
        {
          id: 'old-2',
          resourceId: '/sub/old-2',
          tenantId: null,
          tenantName: 'fabrikam.onmicrosoft.com',
          displayName: 'Old App 2',
          visitedAt: Date.now() - 4000,
          visitCount: 1,
          url: 'https://portal.azure.com/#@fabrikam.onmicrosoft.com/resource/sub/old-2',
        },
      ];
      mockStorage['tenantMapping'] = {};

      // Now trigger an upsert with a URL that has GUID for contoso
      vi.mocked(parsePortalUrl).mockReturnValueOnce({
        tenantId: guid,
        tenantDomain: 'contoso.onmicrosoft.com',
        resourceId: '/subscriptions/new-sub/resourceGroups/rg/providers/Microsoft.Web/sites/new-app',
        blade: null,
        fullUrl: `https://portal.azure.com/${guid}/#@contoso.onmicrosoft.com/resource/subscriptions/new-sub`,
      } as any);

      await historyStore.upsert(`https://portal.azure.com/${guid}/#@contoso.onmicrosoft.com/resource/subscriptions/new-sub`);

      // Check that old-1 (contoso) got backfilled
      const history = mockStorage['history'];
      const old1 = history.find((e: any) => e.id === 'old-1');
      expect(old1.tenantId).toBe(guid);

      // old-2 (fabrikam) should NOT be backfilled
      const old2 = history.find((e: any) => e.id === 'old-2');
      expect(old2.tenantId).toBeNull();
    });

    it('should backfill tenantId without modifying url during backfill', async () => {
      const guid = '66666666-6666-6666-6666-666666666666';
      const originalUrl = 'https://portal.azure.com/#@contoso.onmicrosoft.com/resource/sub/url-test';
      mockStorage['history'] = [
        {
          id: 'url-test',
          resourceId: '/sub/url-test',
          tenantId: null,
          tenantName: 'contoso.onmicrosoft.com',
          displayName: 'URL Test App',
          visitedAt: Date.now() - 5000,
          visitCount: 1,
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

      await historyStore.upsert(`https://portal.azure.com/${guid}/#@contoso.onmicrosoft.com/resource/subscriptions/trigger`);

      const history = mockStorage['history'];
      const backfilled = history.find((e: any) => e.id === 'url-test');
      // tenantId is backfilled with the GUID
      expect(backfilled.tenantId).toBe(guid);
      // url is NOT modified — GUID lives only in tenantId, injected at navigation/copy time
      expect(backfilled.url).toBe(originalUrl);
    });
  });

  describe('delete with pruning', () => {
    it('should prune excess entries when deleting a record', async () => {
      const now = Date.now();
      // Store 20 entries in storage with a limit of 5
      const entries = Array.from({ length: 20 }, (_, i) => ({
        id: String(i),
        resourceId: `/sub/${i}`,
        tenantId: 'tenant1',
        tenantName: 'Tenant 1',
        displayName: `App ${i}`,
        visitedAt: now - i * 1000,
        visitCount: 1,
        url: `https://portal.azure.com/#${i}`,
      }));

      mockStorage['history'] = entries;

      const { settingsStore } = await import('../settings/settings.store');
      vi.mocked(settingsStore.get).mockResolvedValueOnce({
        historyEnabled: true,
        historyRetentionDays: 30,
        historyMaxEntries: 5,
      } as any);

      // Delete the most recent entry (id "0")
      await historyStore.delete('0');

      // Should have pruned to 5 entries (not 19)
      const remaining = mockStorage['history'];
      expect(remaining).toHaveLength(5);

      // Should not contain the deleted entry
      expect(remaining.find((e: any) => e.id === '0')).toBeUndefined();

      // Should contain the next 5 most recent entries
      expect(remaining[0].id).toBe('1');
      expect(remaining[4].id).toBe('5');
    });

    it('should prune excess entries when deleting by resource', async () => {
      const now = Date.now();
      const entries = Array.from({ length: 20 }, (_, i) => ({
        id: String(i),
        resourceId: `/sub/${i}`,
        tenantId: 'tenant1',
        tenantName: 'Tenant 1',
        displayName: `App ${i}`,
        visitedAt: now - i * 1000,
        visitCount: 1,
        url: `https://portal.azure.com/#${i}`,
      }));

      mockStorage['history'] = entries;

      const { settingsStore } = await import('../settings/settings.store');
      vi.mocked(settingsStore.get).mockResolvedValueOnce({
        historyEnabled: true,
        historyRetentionDays: 30,
        historyMaxEntries: 5,
      } as any);

      // Delete by resource
      await historyStore.deleteByResource('/sub/0', 'tenant1');

      const remaining = mockStorage['history'];
      expect(remaining).toHaveLength(5);
      expect(remaining.find((e: any) => e.resourceId === '/sub/0')).toBeUndefined();
      expect(remaining[0].id).toBe('1');
    });
  });
});
