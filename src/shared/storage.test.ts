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
        get: vi.fn((key, cb) => cb({ [key]: mockSyncStorage[key] })),
        set: vi.fn((obj, cb) => { Object.assign(mockSyncStorage, obj); cb?.(); }),
        remove: vi.fn((key, cb) => { delete mockSyncStorage[key]; cb?.(); }),
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

import { storageSyncGet, storageSyncSet, storageSyncRemove, migrateSettingsToSync } from './storage';

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
