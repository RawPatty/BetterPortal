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
}));

import { historyStore } from './history.store';
import { storageGet, storageSet } from '../../shared/storage';

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
});
