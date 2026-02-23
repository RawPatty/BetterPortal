import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSyncStorage: Record<string, any> = {};
const mockLocalStorage: Record<string, any> = {};

vi.mock('../shared/storage', async (importOriginal) => {
  // We test the real module — just mock chrome
  return importOriginal();
});

// Patch chrome.storage.sync and chrome.storage.local
Object.defineProperty(globalThis, 'chrome', {
  value: {
    runtime: { id: 'test', lastError: undefined },
    storage: {
      sync: {
        get: vi.fn((key, cb) => {
          if (key === null) {
            cb({ ...mockSyncStorage });
          } else {
            cb({ [key]: mockSyncStorage[key] });
          }
        }),
        set: vi.fn((obj, cb) => { Object.assign(mockSyncStorage, obj); cb?.(); }),
        remove: vi.fn((key, cb) => {
          if (Array.isArray(key)) {
            key.forEach((k: string) => delete mockSyncStorage[k]);
          } else {
            delete mockSyncStorage[key];
          }
          cb?.();
        }),
        getBytesInUse: vi.fn((_, cb) => cb(0)),
      },
      local: {
        get: vi.fn((key, cb) => cb({ [key]: mockLocalStorage[key] })),
        set: vi.fn((obj, cb) => { Object.assign(mockLocalStorage, obj); cb?.(); }),
        remove: vi.fn((key, cb) => { delete mockLocalStorage[key]; cb?.(); }),
        clear: vi.fn((cb) => cb()),
        getBytesInUse: vi.fn((_, cb) => cb(0)),
      },
    },
  },
  writable: true,
});

import { storageSyncGet, storageSyncSet, storageSyncRemove, storageSyncGetBookmarks, storageSyncSetBookmarks, migrateSettingsToSync } from './storage';
import type { Bookmark } from './types';

function makeBookmark(id: string): Bookmark {
  return {
    id,
    url: `https://portal.azure.com/#resource/test/${id}`,
    tenantId: null,
    tenantName: 'contoso.onmicrosoft.com',
    resourceId: `/subscriptions/sub-1/resourceGroups/${id}`,
    displayName: id,
    alias: null,
    stateDepth: 'full',
    createdAt: 0,
    lastAccessed: 0,
    accessCount: 0,
    isStale: false,
  };
}

describe('migrateSettingsToSync', () => {
  beforeEach(() => {
    Object.keys(mockSyncStorage).forEach(k => delete mockSyncStorage[k]);
    Object.keys(mockLocalStorage).forEach(k => delete mockLocalStorage[k]);
    vi.clearAllMocks();
  });

  it('copies settings from local to sync when sync is empty', async () => {
    const localSettings = { theme: 'dark', historyEnabled: true };
    mockLocalStorage['settings'] = localSettings;

    await migrateSettingsToSync();

    expect(mockSyncStorage['settings']).toEqual(localSettings);
    expect(mockLocalStorage['settings']).toBeUndefined();
  });

  it('copies tenantAliases from local to sync when sync is empty', async () => {
    mockLocalStorage['tenantAliases'] = { 'contoso.onmicrosoft.com': 'Contoso' };

    await migrateSettingsToSync();

    expect(mockSyncStorage['tenantAliases']).toEqual({ 'contoso.onmicrosoft.com': 'Contoso' });
    expect(mockLocalStorage['tenantAliases']).toBeUndefined();
  });

  it('does not overwrite sync data if it already exists', async () => {
    const syncSettings = { theme: 'light' };
    const localSettings = { theme: 'dark' };
    mockSyncStorage['settings'] = syncSettings;
    mockLocalStorage['settings'] = localSettings;

    await migrateSettingsToSync();

    // Sync data preserved
    expect(mockSyncStorage['settings']).toEqual(syncSettings);
  });
});

describe('sync storage primitives', () => {
  beforeEach(() => {
    Object.keys(mockSyncStorage).forEach(k => delete mockSyncStorage[k]);
    vi.clearAllMocks();
  });

  it('storageSyncGet returns null when key is absent', async () => {
    expect(await storageSyncGet('settings')).toBeNull();
  });

  it('storageSyncSet then storageSyncGet round-trips a value', async () => {
    await storageSyncSet('tenantAliases', { 'contoso.onmicrosoft.com': 'Contoso' });
    expect(await storageSyncGet('tenantAliases')).toEqual({ 'contoso.onmicrosoft.com': 'Contoso' });
  });

  it('storageSyncRemove deletes a key', async () => {
    mockSyncStorage['tenantAliases'] = { foo: 'bar' };
    await storageSyncRemove('tenantAliases');
    expect(await storageSyncGet('tenantAliases')).toBeNull();
  });
});

describe('storageSyncGetBookmarks', () => {
  beforeEach(() => {
    Object.keys(mockSyncStorage).forEach(k => delete mockSyncStorage[k]);
    vi.clearAllMocks();
  });

  it('returns empty array when no bp_bm_* keys exist', async () => {
    mockSyncStorage['settings'] = { theme: 'light' };
    expect(await storageSyncGetBookmarks()).toEqual([]);
  });

  it('returns bookmarks from bp_bm_* keys', async () => {
    const bm1 = makeBookmark('bm-1');
    const bm2 = makeBookmark('bm-2');
    mockSyncStorage['bp_bm_bm-1'] = bm1;
    mockSyncStorage['bp_bm_bm-2'] = bm2;

    const result = await storageSyncGetBookmarks();

    expect(result).toHaveLength(2);
    expect(result.map(b => b.id).sort()).toEqual(['bm-1', 'bm-2']);
  });

  it('ignores non-bookmark sync keys', async () => {
    mockSyncStorage['settings'] = { theme: 'dark' };
    mockSyncStorage['tenantAliases'] = { foo: 'bar' };
    mockSyncStorage['bp_bm_bm-1'] = makeBookmark('bm-1');

    const result = await storageSyncGetBookmarks();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('bm-1');
  });
});

describe('storageSyncSetBookmarks', () => {
  beforeEach(() => {
    Object.keys(mockSyncStorage).forEach(k => delete mockSyncStorage[k]);
    vi.clearAllMocks();
  });

  it('stores each bookmark under its own bp_bm_<id> key', async () => {
    const bm1 = makeBookmark('bm-1');
    const bm2 = makeBookmark('bm-2');

    await storageSyncSetBookmarks([bm1, bm2]);

    expect(mockSyncStorage['bp_bm_bm-1']).toEqual(bm1);
    expect(mockSyncStorage['bp_bm_bm-2']).toEqual(bm2);
  });

  it('removes keys for bookmarks no longer in the list', async () => {
    mockSyncStorage['bp_bm_bm-old'] = makeBookmark('bm-old');
    const bm = makeBookmark('bm-new');

    await storageSyncSetBookmarks([bm]);

    expect(mockSyncStorage['bp_bm_bm-old']).toBeUndefined();
    expect(mockSyncStorage['bp_bm_bm-new']).toEqual(bm);
  });

  it('clears all bp_bm_* keys when called with empty list', async () => {
    mockSyncStorage['bp_bm_bm-1'] = makeBookmark('bm-1');
    mockSyncStorage['bp_bm_bm-2'] = makeBookmark('bm-2');
    mockSyncStorage['settings'] = { theme: 'light' };

    await storageSyncSetBookmarks([]);

    expect(mockSyncStorage['bp_bm_bm-1']).toBeUndefined();
    expect(mockSyncStorage['bp_bm_bm-2']).toBeUndefined();
    expect(mockSyncStorage['settings']).toEqual({ theme: 'light' });
  });

  it('does not touch non-bookmark sync keys', async () => {
    mockSyncStorage['settings'] = { theme: 'dark' };

    await storageSyncSetBookmarks([makeBookmark('bm-1')]);

    expect(mockSyncStorage['settings']).toEqual({ theme: 'dark' });
  });
});
