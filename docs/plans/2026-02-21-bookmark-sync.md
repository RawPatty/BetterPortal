# Bookmark Sync & Limit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Sync bookmarks and settings across devices via `chrome.storage.sync` behind an opt-in toggle, with a hard 150-bookmark cap that blocks saves (with an error message) when reached.

**Architecture:** Parallel sync functions are added to `storage.ts`. Settings and tenant aliases always live in sync storage (migrated on first run). Bookmarks route to sync or local based on `bookmarkSyncEnabled` setting. A bookmark migration function runs when the toggle changes. An `overlayError` store shows the limit message in the overlay.

**Tech Stack:** Svelte stores, `chrome.storage.sync`, `chrome.storage.local`, Vitest

---

### Task 1: Add sync storage primitives

**Files:**
- Modify: `src/shared/storage.ts`
- Test: `src/shared/storage.test.ts` (create)

**Step 1: Write the failing tests**

Create `src/shared/storage.test.ts`:

```typescript
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

import { storageSyncGet, storageSyncSet, storageSyncRemove } from './storage';

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
```

**Step 2: Run test to verify it fails**

```
npx vitest run src/shared/storage.test.ts
```

Expected: FAIL — `storageSyncGet` not exported

**Step 3: Implement in `src/shared/storage.ts`**

After the existing `storageRemove` function (around line 88), add:

```typescript
/**
 * Get a value from Chrome sync storage
 */
export async function storageSyncGet<K extends StorageKey>(
  key: K
): Promise<StorageSchema[K] | null> {
  if (!isContextValid()) handleInvalidContext();

  return new Promise((resolve, reject) => {
    try {
      chrome.storage.sync.get(key, (result) => {
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
 * Set a value in Chrome sync storage
 */
export async function storageSyncSet<K extends StorageKey>(
  key: K,
  value: StorageSchema[K]
): Promise<void> {
  if (!isContextValid()) handleInvalidContext();

  return new Promise((resolve, reject) => {
    try {
      chrome.storage.sync.set({ [key]: value }, () => {
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
 * Remove a key from Chrome sync storage
 */
export async function storageSyncRemove(key: StorageKey): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.remove(key, resolve);
  });
}
```

**Step 4: Run tests to verify they pass**

```
npx vitest run src/shared/storage.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git -c core.autocrlf=false add src/shared/storage.ts src/shared/storage.test.ts
git commit -m "Add storageSyncGet/Set/Remove for chrome.storage.sync"
```

---

### Task 2: Add constant and type changes

**Files:**
- Modify: `src/shared/constants.ts`
- Modify: `src/shared/types.ts`

**Step 1: Add `BOOKMARK_MAX_ENTRIES` to `constants.ts`**

In `constants.ts`, replace:

```typescript
export const MAX_ITEMS = {
  HISTORY: 500,
};
```

with:

```typescript
export const MAX_ITEMS = {
  HISTORY: 500,
  BOOKMARKS: 150,
};
```

**Step 2: Add `bookmarkSyncEnabled` to `types.ts`**

In `types.ts`, add the field to the `Settings` interface after `lastExportedAt`:

```typescript
export interface Settings {
  hotkey: HotkeyConfig;
  historyEnabled: boolean;
  historyRetentionDays: number;
  historyMaxEntries: number;
  theme: 'light' | 'dark';
  defaultStateDepth: 'full' | 'resource';
  showStaleIndicator: boolean;
  lastExportedAt: number | null;
  bookmarkSyncEnabled: boolean;  // ← add this
}
```

And add its default in `DEFAULT_SETTINGS`:

```typescript
export const DEFAULT_SETTINGS: Settings = {
  hotkey: { key: 'Space', ctrl: true, shift: false, alt: false, meta: false },
  historyEnabled: true,
  historyRetentionDays: 30,
  historyMaxEntries: 20,
  theme: 'light',
  defaultStateDepth: 'full',
  showStaleIndicator: true,
  lastExportedAt: null,
  bookmarkSyncEnabled: false,  // ← add this
};
```

Also add a `BookmarkSaveResult` type to `types.ts` (after the `Bookmark` interface):

```typescript
export type BookmarkSaveResult =
  | { success: true; bookmark: Bookmark }
  | { success: false; reason: 'limit_reached' };
```

**Step 3: Run full test suite to confirm no breakage**

```
npx vitest run
```

Expected: all existing tests pass

**Step 4: Commit**

```bash
git -c core.autocrlf=false add src/shared/constants.ts src/shared/types.ts
git commit -m "Add BOOKMARK_MAX_ENTRIES constant, bookmarkSyncEnabled setting, BookmarkSaveResult type"
```

---

### Task 3: Migrate settings and tenantAliases to sync on startup

**Files:**
- Modify: `src/shared/storage.ts`
- Modify: `src/features/settings/settings.store.ts`

**Step 1: Write the failing test**

Add to `src/shared/storage.test.ts`:

```typescript
import { migrateSettingsToSync, storageSyncGet } from './storage';

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
```

**Step 2: Run test to verify it fails**

```
npx vitest run src/shared/storage.test.ts
```

Expected: FAIL — `migrateSettingsToSync` not exported

**Step 3: Implement `migrateSettingsToSync` in `storage.ts`**

Add after `storageSyncRemove`:

```typescript
/**
 * One-time migration: move settings and tenantAliases from local to sync.
 * Safe to call on every startup — skips migration if sync already has data.
 */
export async function migrateSettingsToSync(): Promise<void> {
  // Migrate settings
  const syncSettings = await storageSyncGet('settings');
  if (!syncSettings) {
    const localSettings = await storageGet('settings');
    if (localSettings) {
      await storageSyncSet('settings', localSettings);
      await storageRemove('settings');
    }
  }

  // Migrate tenantAliases
  const syncAliases = await storageSyncGet('tenantAliases');
  if (!syncAliases) {
    const localAliases = await storageGet('tenantAliases');
    if (localAliases) {
      await storageSyncSet('tenantAliases', localAliases);
      await storageRemove('tenantAliases');
    }
  }
}
```

**Step 4: Call it from `initializeStorage` in `storage.ts`**

Replace:

```typescript
export async function initializeStorage(): Promise<void> {
  await runMigrations();
}
```

with:

```typescript
export async function initializeStorage(): Promise<void> {
  await migrateSettingsToSync();
  await runMigrations();
}
```

**Step 5: Update `settings.store.ts` to use sync storage**

Replace both `storageGet('settings')` calls and the `storageSet('settings', ...)` calls to use sync:

```typescript
import { storageSyncGet, storageSyncSet } from '../../shared/storage';
import { DEFAULT_SETTINGS, type Settings } from '../../shared/types';

export const settingsStore = {
  async get(): Promise<Settings> {
    const stored = await storageSyncGet('settings');
    if (!stored) {
      return { ...DEFAULT_SETTINGS };
    }
    return { ...DEFAULT_SETTINGS, ...stored };
  },

  async update(partial: Partial<Settings>): Promise<Settings> {
    const current = await this.get();
    const updated = { ...current, ...partial };
    await storageSyncSet('settings', updated);
    return updated;
  },

  async reset(): Promise<Settings> {
    await storageSyncSet('settings', DEFAULT_SETTINGS);
    return { ...DEFAULT_SETTINGS };
  },

  // matchesHotkey and getHotkeyDisplay stay the same
  async matchesHotkey(event: KeyboardEvent): Promise<boolean> {
    const settings = await this.get();
    const { hotkey } = settings;
    return (
      event.key === hotkey.key &&
      event.ctrlKey === hotkey.ctrl &&
      event.shiftKey === hotkey.shift &&
      event.altKey === hotkey.alt
    );
  },

  async getHotkeyDisplay(): Promise<string> {
    const settings = await this.get();
    const { hotkey } = settings;
    const parts: string[] = [];
    if (hotkey.ctrl) parts.push('Ctrl');
    if (hotkey.shift) parts.push('Shift');
    if (hotkey.alt) parts.push('Alt');
    parts.push(hotkey.key);
    return parts.join('+');
  },
};
```

**Step 6: Update `overlay.store.ts` to use sync for tenantAliases**

In `overlay.store.ts`, find all references to `storageGet('tenantAliases')` and `storageSet('tenantAliases', ...)` (currently in `overlayActions.refresh()` and `overlayActions.renameTenant()`).

Import `storageSyncGet` and `storageSyncSet` from `../../shared/storage`.

In `refresh()` replace:
```typescript
storageGet('tenantAliases'),
```
with:
```typescript
storageSyncGet('tenantAliases'),
```

In `renameTenant()` replace:
```typescript
await storageSet('tenantAliases', updated);
```
with:
```typescript
await storageSyncSet('tenantAliases', updated);
```

**Step 7: Run all tests**

```
npx vitest run
```

Expected: all tests pass. Note: the settings store tests already mock storage — check they still work after the import changes.

**Step 8: Commit**

```bash
git -c core.autocrlf=false add src/shared/storage.ts src/shared/storage.test.ts src/features/settings/settings.store.ts src/features/overlay/overlay.store.ts
git commit -m "Migrate settings and tenantAliases to chrome.storage.sync"
```

---

### Task 4: Enforce bookmark limit in bookmarks.store.ts

**Files:**
- Modify: `src/features/bookmarks/bookmarks.store.ts`
- Modify: `src/features/bookmarks/bookmarks.store.test.ts`

**Step 1: Write the failing tests**

Add a `describe('bookmark limit', ...)` block to `bookmarks.store.test.ts`:

```typescript
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
```

**Step 2: Run test to verify it fails**

```
npx vitest run src/features/bookmarks/bookmarks.store.test.ts
```

Expected: FAIL — `bookmarkStore.save` returns void, not a result object

**Step 3: Update `bookmarks.store.ts`**

At the top of `bookmarks.store.ts`, add the import:

```typescript
import { MAX_ITEMS } from '../../shared/constants';
import type { BookmarkSaveResult } from '../../shared/types';
```

Replace the `save` method (currently returns `Promise<void>`):

```typescript
async save(bookmark: Bookmark): Promise<BookmarkSaveResult> {
  const all = await this.getAll();
  const existingIndex = all.findIndex((b) => b.id === bookmark.id);

  if (existingIndex >= 0) {
    // Update existing — always allowed
    all[existingIndex] = bookmark;
    await storageSet('bookmarks', all);
    return { success: true, bookmark: all[existingIndex] };
  }

  // New bookmark — enforce limit
  if (all.length >= MAX_ITEMS.BOOKMARKS) {
    return { success: false, reason: 'limit_reached' };
  }

  all.push(bookmark);
  await storageSet('bookmarks', all);
  return { success: true, bookmark };
},
```

Also update `saveCurrentPage` to enforce the limit for new resources. Find the block:

```typescript
if (existingIndex >= 0) {
  // Update existing bookmark
  ...
  return all[existingIndex];
}

// Add new bookmark
all.push(bookmark);
await storageSet('bookmarks', all);
return bookmark;
```

Replace with:

```typescript
if (existingIndex >= 0) {
  // Update existing bookmark — always allowed
  all[existingIndex] = {
    ...all[existingIndex],
    url: bookmark.url,
    displayName: bookmark.displayName,
    stateDepth: bookmark.stateDepth,
    alias: bookmark.alias ?? all[existingIndex].alias,
  };
  await storageSet('bookmarks', all);
  return { success: true, bookmark: all[existingIndex] };
}

// New bookmark — enforce limit
if (all.length >= MAX_ITEMS.BOOKMARKS) {
  return { success: false, reason: 'limit_reached' };
}

all.push(bookmark);
await storageSet('bookmarks', all);
return { success: true, bookmark };
```

Also update `saveCurrentPage`'s return type in the method signature from `Promise<Bookmark>` to `Promise<BookmarkSaveResult>`.

**Step 4: Run tests**

```
npx vitest run src/features/bookmarks/bookmarks.store.test.ts
```

Expected: new limit tests pass; existing tests may need updating if they call `save` and expected `void`

**Step 5: Fix any callers of `save`/`saveCurrentPage` that expected the old return types**

Search for callers:
```
grep -n "bookmarkStore.save\|bookmarkStore.saveCurrentPage" src/
```

The main callers are in `overlay.store.ts` — update them in Task 6.

**Step 6: Commit**

```bash
git -c core.autocrlf=false add src/features/bookmarks/bookmarks.store.ts src/features/bookmarks/bookmarks.store.test.ts
git commit -m "Enforce 150-bookmark limit in bookmarkStore.save and saveCurrentPage"
```

---

### Task 5: Add bookmark sync/local routing to bookmarks.store.ts

**Files:**
- Modify: `src/features/bookmarks/bookmarks.store.ts`

**Step 1: Write the failing test**

Add to `bookmarks.store.test.ts`:

```typescript
// At top of file, also mock storageSyncGet/storageSyncSet
vi.mock('../../shared/storage', () => ({
  storageGet: vi.fn((key: string) => Promise.resolve(mockStorage[key] ?? null)),
  storageSet: vi.fn((key: string, value: any) => { mockStorage[key] = value; return Promise.resolve(); }),
  storageSyncGet: vi.fn((key: string) => Promise.resolve(mockSyncStorage[key] ?? null)),
  storageSyncSet: vi.fn((key: string, value: any) => { mockSyncStorage[key] = value; return Promise.resolve(); }),
}));

// Add mockSyncStorage at the top:
const mockSyncStorage: Record<string, any> = {};

describe('bookmark sync routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
    Object.keys(mockSyncStorage).forEach(k => delete mockSyncStorage[k]);
  });

  it('reads from local storage when bookmarkSyncEnabled is false', async () => {
    vi.mocked(settingsStore.get).mockResolvedValue({
      ...DEFAULT_SETTINGS,
      bookmarkSyncEnabled: false,
    });
    mockStorage['bookmarks'] = [makeBookmark('bm-local')];

    const result = await bookmarkStore.getAll();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('bm-local');
  });

  it('reads from sync storage when bookmarkSyncEnabled is true', async () => {
    vi.mocked(settingsStore.get).mockResolvedValue({
      ...DEFAULT_SETTINGS,
      bookmarkSyncEnabled: true,
    });
    mockSyncStorage['bookmarks'] = [makeBookmark('bm-sync')];

    const result = await bookmarkStore.getAll();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('bm-sync');
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
```

**Step 2: Run test to verify it fails**

```
npx vitest run src/features/bookmarks/bookmarks.store.test.ts
```

Expected: FAIL — `getAll` always reads from local, ignores sync setting

**Step 3: Implement routing helpers in `bookmarks.store.ts`**

Add imports at the top:

```typescript
import { storageGet, storageSet, storageSyncGet, storageSyncSet } from '../../shared/storage';
```

Add two private helper functions after the existing `getTenantMapping` / `saveTenantMapping`:

```typescript
async function getBookmarkArea(): Promise<'sync' | 'local'> {
  const settings = await settingsStore.get();
  return settings.bookmarkSyncEnabled ? 'sync' : 'local';
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
```

Update every method in `bookmarkStore` that currently calls `storageGet('bookmarks')` or `storageSet('bookmarks', ...)`:

- `getAll`: replace `storageGet('bookmarks')` → `readBookmarks()`
- `save`: replace `storageSet('bookmarks', all)` → `writeBookmarks(all)`
- `saveCurrentPage`: replace `storageSet('bookmarks', all)` → `writeBookmarks(all)` (both occurrences)
- `update`: replace both → `readBookmarks()` / `writeBookmarks(all)`
- `delete`: replace both → `readBookmarks()` / `writeBookmarks(filtered)`
- `import`: replace both → `readBookmarks()` / `writeBookmarks([...existing, ...newBookmarks])`

**Note:** The `learnTenantMapping` backfill (line ~48) directly calls `storageGet('bookmarks')` and `storageSet('bookmarks', ...)`. Update these too.

**Step 4: Run all tests**

```
npx vitest run
```

Expected: all pass

**Step 5: Commit**

```bash
git -c core.autocrlf=false add src/features/bookmarks/bookmarks.store.ts src/features/bookmarks/bookmarks.store.test.ts
git commit -m "Route bookmark reads/writes through sync or local based on bookmarkSyncEnabled setting"
```

---

### Task 6: Add overlayError store and handle limit in overlay actions

**Files:**
- Modify: `src/features/overlay/overlay.store.ts`
- Modify: `src/features/overlay/overlay.store.test.ts`

**Step 1: Write the failing test**

Add to `overlay.store.test.ts`:

```typescript
import { overlayError } from './overlay.store';

// Mock bookmarkStore to return limit_reached
vi.mock('../bookmarks/bookmarks.store', () => ({
  bookmarkStore: {
    saveCurrentPage: vi.fn(),
    save: vi.fn(),
    navigate: vi.fn(),
    delete: vi.fn(),
    getAll: vi.fn(() => Promise.resolve([])),
    update: vi.fn(),
  },
  lookupTenantGuid: vi.fn(() => Promise.resolve(null)),
}));

import { bookmarkStore } from '../bookmarks/bookmarks.store';

describe('overlayError on limit_reached', () => {
  beforeEach(() => {
    overlayError.set(null);
    vi.clearAllMocks();
  });

  it('sets overlayError message when bookmark limit is reached', async () => {
    vi.mocked(bookmarkStore.saveCurrentPage).mockResolvedValue({
      success: false,
      reason: 'limit_reached',
    });

    await overlayActions.saveCurrentPage();

    expect(get(overlayError)).toBe(
      'Bookmark limit reached (150/150) — remove bookmarks to add more.'
    );
  });

  it('does not set overlayError on successful save', async () => {
    vi.mocked(bookmarkStore.saveCurrentPage).mockResolvedValue({
      success: true,
      bookmark: {} as any,
    });

    await overlayActions.saveCurrentPage();

    expect(get(overlayError)).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

```
npx vitest run src/features/overlay/overlay.store.test.ts
```

Expected: FAIL — `overlayError` not exported

**Step 3: Add `overlayError` store to `overlay.store.ts`**

After the `currentDirectory` writable store (around line 39), add:

```typescript
// Store for inline error messages (e.g. bookmark limit reached). Auto-clears after 4s.
export const overlayError = writable<string | null>(null);

let _errorTimer: ReturnType<typeof setTimeout> | null = null;

function setOverlayError(message: string): void {
  overlayError.set(message);
  if (_errorTimer) clearTimeout(_errorTimer);
  _errorTimer = setTimeout(() => overlayError.set(null), 4000);
}
```

**Step 4: Update `saveCurrentPage` and `saveHistoryItem` in `overlayActions`**

Replace `saveCurrentPage`:

```typescript
async saveCurrentPage(alias?: string) {
  const result = await bookmarkStore.saveCurrentPage({ alias });
  if (!result.success) {
    if (result.reason === 'limit_reached') {
      setOverlayError(
        `Bookmark limit reached (${MAX_ITEMS.BOOKMARKS}/${MAX_ITEMS.BOOKMARKS}) — remove bookmarks to add more.`
      );
    }
    return;
  }
  await this.refresh();
},
```

Add the import at the top of the file:

```typescript
import { MAX_ITEMS } from '../../shared/constants';
```

Replace `saveHistoryItem` — the `bookmarkStore.save(bookmark)` call now returns `BookmarkSaveResult`:

```typescript
async saveHistoryItem(historyEntry: HistoryEntry) {
  const bookmark: Bookmark = {
    id: crypto.randomUUID(),
    url: historyEntry.url,
    tenantId: historyEntry.tenantId,
    tenantName: historyEntry.tenantName,
    resourceId: historyEntry.resourceId,
    displayName: historyEntry.displayName,
    alias: null,
    stateDepth: 'full',
    createdAt: Date.now(),
    lastAccessed: Date.now(),
    accessCount: 0,
    isStale: false,
  };

  const result = await bookmarkStore.save(bookmark);
  if (!result.success) {
    if (result.reason === 'limit_reached') {
      setOverlayError(
        `Bookmark limit reached (${MAX_ITEMS.BOOKMARKS}/${MAX_ITEMS.BOOKMARKS}) — remove bookmarks to add more.`
      );
    }
    return;
  }
  await this.refresh();
},
```

**Step 5: Run tests**

```
npx vitest run src/features/overlay/overlay.store.test.ts
```

Expected: all pass

**Step 6: Commit**

```bash
git -c core.autocrlf=false add src/features/overlay/overlay.store.ts src/features/overlay/overlay.store.test.ts
git commit -m "Add overlayError store and show limit message when bookmark cap is reached"
```

---

### Task 7: Display error banner in Overlay.svelte

**Files:**
- Modify: `src/features/overlay/Overlay.svelte`

**Step 1: Import `overlayError` in the script block**

In the existing import line from `./overlay.store`, add `overlayError`:

```typescript
import {
  isOverlayOpen,
  overlayActions,
  filteredItems,
  itemsByTenant,
  selectedIndex,
  searchQuery,
  overlayMode,
  currentDirectoryDisplay,
  overlayError,   // ← add
} from './overlay.store';
```

**Step 2: Add error banner above the list**

Find the `<div class="bp-list" bind:this={listRef}>` element. Immediately before it, add:

```svelte
{#if $overlayError}
  <div class="bp-error-banner" role="alert">
    {$overlayError}
  </div>
{/if}
```

**Step 3: Add CSS for the banner**

In the `<style>` block, add:

```css
.bp-error-banner {
  padding: 8px 14px;
  background: var(--bp-error, #d13438);
  color: #fff;
  font-size: 13px;
  text-align: center;
  flex-shrink: 0;
}
```

**Step 4: Build and verify visually**

```
npm run build
```

Load the extension in Chrome, attempt to save a 151st bookmark, confirm the red banner appears and disappears after ~4 seconds.

**Step 5: Commit**

```bash
git -c core.autocrlf=false add src/features/overlay/Overlay.svelte
git commit -m "Show error banner in overlay when bookmark limit is reached"
```

---

### Task 8: Add bookmark migration functions

**Files:**
- Modify: `src/features/bookmarks/bookmarks.store.ts`

These are called when the sync toggle is changed in settings.

**Step 1: Add `migrateBookmarksToSync` and `migrateBookmarksFromSync`**

At the bottom of `bookmarks.store.ts`, export two functions:

```typescript
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
```

Import `storageRemove` and `storageSyncRemove` at the top if not already there:

```typescript
import { storageGet, storageSet, storageRemove, storageSyncGet, storageSyncSet, storageSyncRemove } from '../../shared/storage';
```

**Step 2: Run all tests**

```
npx vitest run
```

Expected: all pass (these are simple wrappers — no new tests needed beyond existing storage coverage)

**Step 3: Commit**

```bash
git -c core.autocrlf=false add src/features/bookmarks/bookmarks.store.ts
git commit -m "Add migrateBookmarksToSync and migrateBookmarksFromSync"
```

---

### Task 9: Add Bookmarks section to SettingsPanel.svelte

**Files:**
- Modify: `src/features/settings/SettingsPanel.svelte`

**Step 1: Add import and state to the script block**

Add to the imports at the top:

```typescript
import { migrateBookmarksToSync, migrateBookmarksFromSync, bookmarkStore } from '../bookmarks/bookmarks.store';
import { MAX_ITEMS } from '../../shared/constants';
```

Add new state variables after `let showAbout = false`:

```typescript
let bookmarkCount = 0;
let bookmarkSyncMigrating = false;
let bookmarkSyncError = '';
```

Update `onMount` to also load the bookmark count:

```typescript
onMount(async () => {
  settings = await settingsStore.get();
  const bm = await bookmarkStore.getAll();
  bookmarkCount = bm.length;
});
```

**Step 2: Add the toggle handler**

```typescript
async function handleBookmarkSyncToggle() {
  bookmarkSyncMigrating = true;
  bookmarkSyncError = '';
  const enabling = settings.bookmarkSyncEnabled;

  try {
    if (enabling) {
      await migrateBookmarksToSync();
    } else {
      await migrateBookmarksFromSync();
    }
    await saveSettings();
  } catch (e: any) {
    // Revert the toggle on failure
    settings.bookmarkSyncEnabled = !enabling;
    bookmarkSyncError = 'Migration failed. Please try again.';
  } finally {
    bookmarkSyncMigrating = false;
  }
}
```

**Step 3: Add the Bookmarks section to the template**

After the closing `</section>` of the "History & Bookmarks" section and before `</div>` that closes `bp-settings-content`, add:

```svelte
<!-- Bookmarks Section -->
<section class="bp-settings-section">
  <h3>Bookmarks</h3>
  <div class="bp-settings-row">
    <span class="bp-label">
      {bookmarkCount} / {MAX_ITEMS.BOOKMARKS} bookmarks
    </span>
  </div>
  <div class="bp-settings-row">
    <label for="bookmarkSync">
      <input
        id="bookmarkSync"
        type="checkbox"
        bind:checked={settings.bookmarkSyncEnabled}
        on:change={handleBookmarkSyncToggle}
        disabled={bookmarkSyncMigrating}
      />
      Sync bookmarks across devices
    </label>
    {#if bookmarkSyncMigrating}
      <span class="bp-sync-status">Migrating…</span>
    {/if}
  </div>
  {#if bookmarkSyncError}
    <div class="bp-error">{bookmarkSyncError}</div>
  {/if}
</section>
```

**Step 4: Add CSS for the migrating label**

In the `<style>` block, add:

```css
.bp-sync-status {
  font-size: 12px;
  color: var(--bp-text-secondary, #666);
  font-style: italic;
}
```

**Step 5: Build and verify**

```
npm run build
```

Open settings, confirm the "Bookmarks" section appears with the count and toggle.

**Step 6: Commit**

```bash
git -c core.autocrlf=false add src/features/settings/SettingsPanel.svelte
git commit -m "Add Bookmarks section to settings with sync toggle and count display"
```

---

### Task 10: Final verification and version bump

**Step 1: Run full test suite**

```
npx vitest run
```

Expected: all tests pass, no warnings

**Step 2: Build**

```
npm run build
```

Expected: clean build

**Step 3: Manual verification checklist**

- [ ] Open overlay with <150 bookmarks — saving works normally
- [ ] Fill to 150 bookmarks — next save shows error banner "Bookmark limit reached (150/150) — remove bookmarks to add more."
- [ ] Error banner disappears after ~4 seconds
- [ ] Updating an existing bookmark at the limit succeeds silently
- [ ] Open settings — see "X / 150 bookmarks" count
- [ ] Toggle "Sync bookmarks" on — see "Migrating…", then toggle settles
- [ ] Toggle "Sync bookmarks" off — same behaviour
- [ ] Settings (theme, hotkey, etc.) persist across browser restart
- [ ] Tenant aliases persist across browser restart

**Step 4: Bump version and commit**

In `src/manifest.json` and `package.json`, bump patch version (e.g. `1.0.73` → `1.0.74`).

```bash
git -c core.autocrlf=false add src/manifest.json package.json
git commit -m "Bump version to 1.0.74"
```

**Step 5: Push and package**

```bash
git push
npm run build
# then run the PowerShell zip script from MEMORY.md
```
