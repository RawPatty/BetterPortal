// Chrome storage wrapper with typed access and migration support
import type { StorageSchema } from './types';
import { DEFAULT_SETTINGS } from './types';

type StorageKey = keyof StorageSchema;

// Current schema versions
const SCHEMA_VERSIONS = {
  bookmarks: 1,
  history: 1,
  settings: 1,
  snapshots: 1,
} as const;

/**
 * Check if extension context is still valid
 */
function isContextValid(): boolean {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

/**
 * Handle invalid context - prompt user to refresh
 */
function handleInvalidContext(): never {
  const msg = '[BetterPortal] Extension updated. Please refresh the page.';
  console.warn(msg);
  throw new Error(msg);
}

/**
 * Get a value from Chrome storage
 */
export async function storageGet<K extends StorageKey>(
  key: K
): Promise<StorageSchema[K] | null> {
  if (!isContextValid()) handleInvalidContext();

  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.get(key, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result[key] ?? null);
        }
      });
    } catch (e) {
      handleInvalidContext();
    }
  });
}

/**
 * Set a value in Chrome storage
 */
export async function storageSet<K extends StorageKey>(
  key: K,
  value: StorageSchema[K]
): Promise<void> {
  if (!isContextValid()) handleInvalidContext();

  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    } catch (e) {
      handleInvalidContext();
    }
  });
}

/**
 * Remove a key from Chrome storage
 */
export async function storageRemove(key: StorageKey): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(key, resolve);
  });
}

/**
 * Get multiple values from Chrome storage
 */
export async function storageGetMany<K extends StorageKey>(
  keys: K[]
): Promise<Partial<Pick<StorageSchema, K>>> {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => {
      resolve(result as Partial<Pick<StorageSchema, K>>);
    });
  });
}

/**
 * Set multiple values in Chrome storage
 */
export async function storageSetMany(
  items: Partial<StorageSchema>
): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(items, resolve);
  });
}

/**
 * Clear all storage
 */
export async function storageClear(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.clear(resolve);
  });
}

/**
 * Get storage usage info
 */
export async function storageGetBytesInUse(): Promise<number> {
  return new Promise((resolve) => {
    chrome.storage.local.getBytesInUse(null, resolve);
  });
}

/**
 * Run migrations if schema version has changed
 */
export async function runMigrations(): Promise<void> {
  const versionKeys = [
    'bookmarks_version',
    'history_version',
    'settings_version',
    'snapshots_version',
  ] as const;

  const versions = await storageGetMany([...versionKeys]);

  // Check and update each schema
  for (const [key, currentVersion] of Object.entries(SCHEMA_VERSIONS)) {
    const versionKey = `${key}_version` as keyof typeof versions;
    const storedVersion = versions[versionKey] ?? 0;

    if (storedVersion < currentVersion) {
      console.log(`[BetterPortal] Migrating ${key} from v${storedVersion} to v${currentVersion}`);
      await migrateSchema(key as keyof typeof SCHEMA_VERSIONS, storedVersion, currentVersion);
      await storageSet(versionKey as StorageKey, currentVersion as any);
    }
  }
}

/**
 * Handle schema migrations
 */
async function migrateSchema(
  schema: keyof typeof SCHEMA_VERSIONS,
  fromVersion: number,
  toVersion: number
): Promise<void> {
  // Add migration logic here as schemas evolve
  // For v1, just ensure the data structure exists

  if (fromVersion === 0) {
    switch (schema) {
      case 'bookmarks':
        const bookmarks = await storageGet('bookmarks');
        if (!bookmarks) {
          await storageSet('bookmarks', []);
        }
        break;

      case 'history':
        const history = await storageGet('history');
        if (!history) {
          await storageSet('history', []);
        }
        break;

      case 'settings':
        const settings = await storageGet('settings');
        if (!settings) {
          await storageSet('settings', DEFAULT_SETTINGS);
        }
        break;

      case 'snapshots':
        const snapshots = await storageGet('snapshots');
        if (!snapshots) {
          await storageSet('snapshots', []);
        }
        break;
    }
  }
}

/**
 * Initialize storage with defaults if needed
 */
export async function initializeStorage(): Promise<void> {
  await runMigrations();
}

/**
 * Export all data as JSON string
 */
export async function exportAllData(): Promise<string> {
  const data = await storageGetMany([
    'bookmarks',
    'history',
    'settings',
    'snapshots',
  ]);

  return JSON.stringify({
    ...data,
    exportedAt: Date.now(),
    version: '1.0.0',
  }, null, 2);
}

/**
 * Import data from JSON string
 */
export async function importData(json: string): Promise<{
  bookmarksAdded: number;
  historyAdded: number;
  settingsImported: boolean;
}> {
  const data = JSON.parse(json);
  const result = {
    bookmarksAdded: 0,
    historyAdded: 0,
    settingsImported: false,
  };

  // Import bookmarks (merge, skip duplicates)
  if (data.bookmarks && Array.isArray(data.bookmarks)) {
    const existing = (await storageGet('bookmarks')) || [];
    const existingKeys = new Set(
      existing.map((b: any) => `${b.resourceId}:${b.tenantId}`)
    );

    const newBookmarks = data.bookmarks.filter(
      (b: any) => !existingKeys.has(`${b.resourceId}:${b.tenantId}`)
    );

    await storageSet('bookmarks', [...existing, ...newBookmarks]);
    result.bookmarksAdded = newBookmarks.length;
  }

  // Import history (merge, skip duplicates)
  if (data.history && Array.isArray(data.history)) {
    const existing = (await storageGet('history')) || [];
    const existingKeys = new Set(
      existing.map((h: any) => `${h.resourceId}:${h.tenantId}`)
    );

    const newHistory = data.history.filter(
      (h: any) => !existingKeys.has(`${h.resourceId}:${h.tenantId}`)
    );

    await storageSet('history', [...existing, ...newHistory]);
    result.historyAdded = newHistory.length;
  }

  // Optionally import settings
  if (data.settings) {
    await storageSet('settings', { ...DEFAULT_SETTINGS, ...data.settings });
    result.settingsImported = true;
  }

  return result;
}
