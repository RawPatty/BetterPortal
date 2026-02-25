# Copy System Redesign

## Problem

The copy URL feature produces URLs without the directory GUID needed for cross-directory navigation. The root cause is a chicken-and-egg problem: GUIDs never appear in Azure Portal URLs during normal browsing (only in URLs BetterPortal itself constructs for forced directory switches), so items are saved with `tenantId = null`, the tenant mapping cache stays empty, and copy has nothing to inject.

Additionally, the directory-level copy button fails for non-current directories because it relies on finding a stored GUID among group items, which are mostly null.

## Design

### Core Insight

`getTenantGuidFromPortal()` (which reads `window.Portal.tenant.id` via page context) reliably returns the current/authenticated directory's GUID. It was removed from the save path because it returns the *authenticated* directory's GUID, not the *browsed* directory's GUID — poisoning cross-directory items. The fix is to use it selectively with a domain-match guard, and build up a persistent domain-to-GUID map over time.

### Persistent Tenant Mapping

The existing `tenantMapping` cache (domain -> GUID in Chrome storage) becomes the central source of truth for GUID resolution. It gets populated passively as the user browses different directories:

- **On every overlay open / page load**: read the current directory's GUID from `getTenantGuidFromPortal()` and cache it via `updateTenantMapping(guid, currentDomain)`. This builds the map over time without requiring any explicit user action.
- **On save**: if the URL has a GUID in path (rare), also cache it.

### Save-Time GUID Resolution

When saving a bookmark or history entry:

1. If URL has GUID in path -> use it (rare, BetterPortal-constructed URLs only)
2. If item's domain matches current directory -> use `getTenantGuidFromPortal()` result
3. If item's domain is different (cross-directory) -> `lookupTenantGuid(item.tenantDomain)` from cache
4. If cache miss -> `null` (user has never visited that directory; backfill will heal it later)

When a GUID is resolved, call `learnTenantMapping()` to cache the mapping and backfill existing items with null tenantId for that domain.

### Copy-Time Behavior

Simple — use the stored `tenantId` directly:

- `item.tenantId` is non-null -> `buildNavigationUrl(item.url, item.tenantId)` (injects GUID into URL path)
- `item.tenantId` is null -> copy raw URL (rare edge case; only if that directory was never visited)

No cascade, no suspect GUID detection, no sibling scanning.

### Directory Copy Button

- Use the first item's `tenantId` in the tenant group
- Copies the GUID string (not a URL)

### What Gets Removed

- **Suspect GUID guard** (`guidIsSuspect` logic in `buildCopyUrl`): no longer needed since save-time resolution prevents wrong GUIDs from being stored
- **Copy-time cascade**: no cache lookup, sibling scan, or current-directory fallback at copy time
- **"GUID unavailable" conditional tooltip**: simplified to just "Copy URL" always

### What Gets Kept

- **`learnTenantMapping` backfill**: still needed to heal cross-directory items that were saved with null before the user visited that directory
- **`tenantMapping` cache**: promoted from secondary fallback to primary GUID source for cross-directory saves
- **`buildNavigationUrl`**: unchanged, still injects GUID into `portal.azure.com/{GUID}/#@domain/resource/...`

## Files Changed

| File | Change |
|------|--------|
| `bookmarks.store.ts` | Add `getTenantGuidFromPortal()` + domain-match guard at save time. Add cache lookup for cross-directory items. |
| `history.store.ts` | Same save-time changes as bookmarks. |
| `url-parser.ts` | Simplify `buildCopyUrl()` to just use stored tenantId. Remove suspect GUID logic. |
| `overlay.store.ts` | On refresh, cache current directory GUID via `updateTenantMapping()`. |
| `Overlay.svelte` | Simplify `copyItemUrl` (no cascade args). Simplify directory copy. Remove conditional tooltip. |

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Same-directory item | GUID from `getTenantGuidFromPortal()` at save time |
| Cross-directory item, directory previously visited | GUID from tenant mapping cache at save time |
| Cross-directory item, directory never visited | `null` at save time; backfilled when user later visits that directory |
| Item saved before this fix (null tenantId) | Backfilled when `learnTenantMapping` fires for that domain |
| Copy with null tenantId | Raw URL copied (works for same-directory navigation) |
