# Bookmark Sync & Limit Design

**Date:** 2026-02-21
**Status:** Approved

## Overview

Sync bookmarks and settings across devices using `chrome.storage.sync`, with an opt-in user toggle. History always stays device-local. A hard cap of 150 bookmarks prevents exceeding the sync quota.

## Storage Routing

| Data | Storage area |
|------|-------------|
| `settings` | sync (always) |
| `tenantAliases` | sync (always) |
| `bookmarks` | sync or local, based on `bookmarkSyncEnabled` setting |
| `history`, version keys | local (always) |

`storage.ts` gains parallel sync functions (`storageSyncGet` / `storageSyncSet` / `storageSyncRemove`) targeting `chrome.storage.sync`. Existing local functions are unchanged.

On first run after this update, a one-time migration moves `settings` and `tenantAliases` from local to sync storage.

## Bookmark Limit

- Hard cap: `BOOKMARK_MAX_ENTRIES = 150` (constant in `constants.ts`)
- Enforced in `bookmarkStore.save()` before writing
- Returns a typed result: `{ success: false, reason: 'limit_reached' }` when rejected
- Error message shown in overlay: **"Bookmark limit reached (150/150) — remove bookmarks to add more."**
- The count `(X/150)` reflects the current bookmark count at time of the failed save

## Sync Toggle

New setting: `bookmarkSyncEnabled: boolean` (default `false`, opt-in).

**Toggling ON (local → sync):**
1. Disable toggle, show "Migrating…" label
2. Read all bookmarks from `chrome.storage.local`
3. Write them to `chrome.storage.sync`
4. On success: delete local bookmark entry, re-enable toggle
5. On failure: revert toggle to off, show error message

**Toggling OFF (sync → local):**
1. Disable toggle, show "Migrating…" label
2. Read all bookmarks from `chrome.storage.sync`
3. Write them to `chrome.storage.local`
4. On success: delete sync bookmark entry, re-enable toggle
5. On failure: revert toggle to on, show error message

Migration is async and fast (<1 second for 150 bookmarks). Chrome writes to sync storage locally before cloud propagation, so the operation completes quickly with no UI blocking.

## Settings UI

A new "Bookmarks" section in the Settings panel containing:
- **"Sync bookmarks across devices"** toggle with inline migrating/error state
- **"X / 150 bookmarks"** count display

## Error Handling

- Sync quota exceeded during migration: revert toggle, show error
- Storage API failure: revert toggle, show error
- Bookmark save rejected at limit: show inline error in overlay, do not save

## What Is Not Changing

- History storage: always `chrome.storage.local`, no sync
- Bookmark data structure: no schema changes
- Existing local-only users (toggle off): behavior identical to today
