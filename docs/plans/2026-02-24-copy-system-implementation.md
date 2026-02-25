# Copy System Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix copy URL feature so every copied URL contains the directory GUID for cross-tenant navigation, by resolving GUIDs at save time via page context and a persistent domain-to-GUID cache.

**Architecture:** Use `getTenantGuidFromPortal()` at save time with a domain-match guard for same-directory items. For cross-directory items, look up the GUID from a persistent `tenantMapping` cache (domain -> GUID). Populate the cache passively on every overlay open. Simplify copy-time to just use the stored `tenantId` directly.

**Tech Stack:** TypeScript, Svelte, Vitest, Chrome Extension APIs (storage)

**Design doc:** `docs/plans/2026-02-24-copy-system-design.md`

---

### Task 1: Cache current directory GUID on overlay open

Populate the tenant mapping cache passively whenever the overlay opens, so the domain-to-GUID map builds up over time.

**Files:**
- Modify: `src/features/overlay/overlay.store.ts:7` (add import for `getTenantGuidFromPortal`)
- Modify: `src/features/overlay/overlay.store.ts:201-202` (add cache call in `refresh()`)

**Step 1: Write the failing test**

No unit test needed — `overlay.store.ts` has no test file, and this is a simple integration of two existing functions. We'll verify via the build step.

**Step 2: Add import**

In `src/features/overlay/overlay.store.ts`, add `getTenantGuidFromPortal` to the import from `url-parser`:

```typescript
import { getCurrentDirectoryInfo, getTenantGuidFromPortal } from '../bookmarks/url-parser';
```

**Step 3: Add import for updateTenantMapping**

Add to imports:

```typescript
import { bookmarkStore, navigateToItem, updateTenantMapping } from '../bookmarks/bookmarks.store';
```

**Step 4: Cache GUID in refresh()**

In the `refresh()` method, after `currentDirectory.set(getCurrentDirectoryInfo())`, add:

```typescript
// Passively cache current directory's domain → GUID mapping.
// getTenantGuidFromPortal() reads window.Portal.tenant.id which reliably
// returns the authenticated directory's GUID. By caching on every overlay
// open, we build up the mapping over time for use at save time.
const dirInfo = getCurrentDirectoryInfo();
const portalGuid = getTenantGuidFromPortal();
if (dirInfo.domain && portalGuid) {
  updateTenantMapping(portalGuid, dirInfo.domain);
}
```

Note: `currentDirectory.set(dirInfo)` was already called — reuse the same `dirInfo` variable. Refactor line 202 from `currentDirectory.set(getCurrentDirectoryInfo())` to use the variable.

**Step 5: Build and verify**

Run: `npm run build`
Expected: Clean build, no errors.

**Step 6: Commit**

```bash
git add src/features/overlay/overlay.store.ts
git commit -m "feat: cache current directory GUID on overlay open"
```

---

### Task 2: Add save-time GUID resolution to bookmarks store

When saving a bookmark, resolve tenantId from page context (same-directory) or cache (cross-directory) instead of leaving it null.

**Files:**
- Modify: `src/features/bookmarks/bookmarks.store.ts:5-16` (add import for `getTenantGuidFromPortal`)
- Modify: `src/features/bookmarks/bookmarks.store.ts:255-281` (save-time GUID resolution)
- Test: `src/features/bookmarks/bookmarks.store.test.ts`

**Step 1: Write the failing tests**

Add these tests to `bookmarks.store.test.ts` inside the existing `describe('tenant GUID fallbacks at save time')` block. These replace the existing tests that assert null tenantId.

```typescript
it('should store GUID from page context when item domain matches current directory', async () => {
  const pageContextGuid = '99999999-9999-9999-9999-999999999999';
  vi.mocked(getTenantGuidFromPortal).mockReturnValueOnce(pageContextGuid);
  // getCurrentDirectoryInfo returns matching domain
  const { getCurrentDirectoryInfo } = await import('./url-parser');
  vi.mocked(getCurrentDirectoryInfo).mockReturnValueOnce({
    domain: 'contoso.onmicrosoft.com',
    guid: null,
  });

  const result = await bookmarkStore.saveCurrentPage();

  expect(result.success).toBe(true);
  if (result.success) expect(result.bookmark.tenantId).toBe(pageContextGuid);
});

it('should store null tenantId when item domain does NOT match current directory and cache has no mapping', async () => {
  // Page context returns home tenant GUID, but item is from a different directory
  const pageContextGuid = '99999999-9999-9999-9999-999999999999';
  vi.mocked(getTenantGuidFromPortal).mockReturnValueOnce(pageContextGuid);
  const { getCurrentDirectoryInfo } = await import('./url-parser');
  vi.mocked(getCurrentDirectoryInfo).mockReturnValueOnce({
    domain: 'fabrikam.onmicrosoft.com',  // different from item's contoso domain
    guid: null,
  });
  // parsePortalUrl returns a different domain for the item
  const { parsePortalUrl } = await import('./url-parser');
  vi.mocked(parsePortalUrl).mockReturnValueOnce({
    tenantId: null,
    tenantDomain: 'contoso.onmicrosoft.com',
    resourceId: '/subscriptions/sub-123/resourceGroups/rg-test/providers/Microsoft.Web/sites/my-app',
    blade: null,
    fullUrl: 'https://portal.azure.com/#@contoso.onmicrosoft.com/resource/subscriptions/sub-123',
  });

  const result = await bookmarkStore.saveCurrentPage();

  expect(result.success).toBe(true);
  if (result.success) expect(result.bookmark.tenantId).toBeNull();
});

it('should store GUID from cache for cross-directory item when cache has mapping', async () => {
  // Populate cache first
  const { updateTenantMapping } = await import('./bookmarks.store');
  await updateTenantMapping('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'contoso.onmicrosoft.com');

  // Page context returns a DIFFERENT directory's GUID (fabrikam)
  vi.mocked(getTenantGuidFromPortal).mockReturnValueOnce('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  const { getCurrentDirectoryInfo } = await import('./url-parser');
  vi.mocked(getCurrentDirectoryInfo).mockReturnValueOnce({
    domain: 'fabrikam.onmicrosoft.com',  // current dir is fabrikam
    guid: null,
  });
  // Item URL is from contoso (cross-directory)
  // Default mock parsePortalUrl returns tenantDomain: 'contoso.onmicrosoft.com'

  const result = await bookmarkStore.saveCurrentPage();

  expect(result.success).toBe(true);
  if (result.success) expect(result.bookmark.tenantId).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/bookmarks/bookmarks.store.test.ts`
Expected: First and third tests FAIL (currently stores null). Second test may pass (already stores null).

**Step 3: Update imports in bookmarks.store.ts**

Add `getTenantGuidFromPortal` to the url-parser import:

```typescript
import {
  parsePortalUrl,
  getTenantNameFromDOM,
  getResourceNameFromDOM,
  extractResourceName,
  extractDisplayName,
  stripBlade,
  stripTenantGuidFromUrl,
  buildNavigationUrl,
  getCurrentDirectoryInfo,
  isSameDirectory,
  getTenantGuidFromPortal,
} from './url-parser';
```

**Step 4: Replace the save-time GUID resolution block**

In `bookmarks.store.ts`, replace lines 255-281 (the strategy comment + effectiveTenantId block) with:

```typescript
    // Determine tenant ID for navigation (MUST be GUID) and tenant name for grouping
    //
    // Strategy: resolve GUID at save time via multiple sources:
    // 1. URL path GUID (rare — only in BetterPortal-constructed directory-switch URLs)
    // 2. Page context (getTenantGuidFromPortal) — safe when item's domain matches current directory
    // 3. Tenant mapping cache — for cross-directory items where we've previously learned the GUID
    // 4. null — directory never visited; learnTenantMapping backfill will heal later

    const effectiveTenantName = getTenantNameFromDOM() || parsed.tenantDomain || 'Unknown Tenant';

    let effectiveTenantId: string | null = null;

    if (parsed.tenantId && GUID_REGEX.test(parsed.tenantId)) {
      // 1. URL path GUID — always trust it
      effectiveTenantId = parsed.tenantId;
    } else {
      // No GUID in URL path — try page context and cache
      const currentDir = getCurrentDirectoryInfo();
      const itemDomain = effectiveTenantName.toLowerCase();
      const currentDomain = currentDir.domain?.toLowerCase() ?? null;

      if (currentDomain && itemDomain === currentDomain) {
        // 2. Same directory — page context GUID is reliable
        const portalGuid = getTenantGuidFromPortal();
        if (portalGuid && GUID_REGEX.test(portalGuid)) {
          effectiveTenantId = portalGuid;
        }
      } else {
        // 3. Cross-directory — look up from cache
        const cachedGuid = await lookupTenantGuid(itemDomain);
        if (cachedGuid) {
          effectiveTenantId = cachedGuid;
        }
      }
    }

    // Cache the mapping and backfill existing items with null tenantId for this domain
    if (effectiveTenantId && parsed.tenantDomain) {
      await learnTenantMapping(effectiveTenantId, parsed.tenantDomain);
    }
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run src/features/bookmarks/bookmarks.store.test.ts`
Expected: All tests PASS. Update any existing tests that asserted null tenantId for same-directory items — they should now assert the page context GUID.

**Step 6: Remove/update old tests**

The existing test "should store null tenantId when URL has no GUID even if page context has a GUID" (lines 86-98) needs updating. That test had `getTenantGuidFromPortal` returning a GUID but expected null. Now it should expect the GUID (since the mock's default `getCurrentDirectoryInfo` returns `contoso.onmicrosoft.com` which matches the mock `parsePortalUrl` domain).

Update the test to expect the page context GUID instead of null:

```typescript
it('should store GUID from page context when URL has no path GUID but domains match', async () => {
  const pageContextGuid = '99999999-9999-9999-9999-999999999999';
  vi.mocked(getTenantGuidFromPortal).mockReturnValueOnce(pageContextGuid);

  const result = await bookmarkStore.saveCurrentPage();

  expect(result.success).toBe(true);
  if (result.success) expect(result.bookmark.tenantId).toBe(pageContextGuid);
});
```

**Step 7: Commit**

```bash
git add src/features/bookmarks/bookmarks.store.ts src/features/bookmarks/bookmarks.store.test.ts
git commit -m "feat: resolve tenantId at bookmark save time via page context and cache"
```

---

### Task 3: Add save-time GUID resolution to history store

Same logic as bookmarks, applied to history entries.

**Files:**
- Modify: `src/features/history/history.store.ts:4` (add import for `getTenantGuidFromPortal`, `getCurrentDirectoryInfo`)
- Modify: `src/features/history/history.store.ts:92-118` (save-time GUID resolution)
- Test: `src/features/history/history.store.test.ts`

**Step 1: Write the failing tests**

Add tests to `history.store.test.ts` mirroring the bookmark tests above. Test three scenarios:
1. Same-directory item → GUID from page context
2. Cross-directory item with cache → GUID from cache
3. Cross-directory item without cache → null

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/history/history.store.test.ts`

**Step 3: Add imports**

In `history.store.ts`, add `getTenantGuidFromPortal` and `getCurrentDirectoryInfo` to the url-parser import:

```typescript
import { parsePortalUrl, getTenantNameFromDOM, getResourceNameFromDOM, extractResourceName, extractDisplayName, stripTenantGuidFromUrl, isErrorPage, getTenantGuidFromPortal, getCurrentDirectoryInfo } from '../bookmarks/url-parser';
```

**Step 4: Replace the save-time GUID resolution block**

In `history.store.ts`, replace lines 92-118 (the strategy comment + effectiveTenantId block) with the same pattern as bookmarks:

```typescript
      // Determine tenant ID for navigation and tenant name for grouping
      //
      // Strategy: resolve GUID at save time via multiple sources:
      // 1. URL path GUID (rare — only in BetterPortal-constructed directory-switch URLs)
      // 2. Page context (getTenantGuidFromPortal) — safe when item's domain matches current directory
      // 3. Tenant mapping cache — for cross-directory items where we've previously learned the GUID
      // 4. null — directory never visited; learnTenantMapping backfill will heal later

      const effectiveTenantName = getTenantNameFromDOM() || parsed.tenantDomain || 'Unknown Tenant';

      let effectiveTenantId: string | null = null;

      if (parsed.tenantId && GUID_REGEX.test(parsed.tenantId)) {
        // 1. URL path GUID — always trust it
        effectiveTenantId = parsed.tenantId;
      } else {
        // No GUID in URL path — try page context and cache
        const currentDir = getCurrentDirectoryInfo();
        const itemDomain = effectiveTenantName.toLowerCase();
        const currentDomain = currentDir.domain?.toLowerCase() ?? null;

        if (currentDomain && itemDomain === currentDomain) {
          // 2. Same directory — page context GUID is reliable
          const portalGuid = getTenantGuidFromPortal();
          if (portalGuid && GUID_REGEX.test(portalGuid)) {
            effectiveTenantId = portalGuid;
          }
        } else {
          // 3. Cross-directory — look up from cache
          const cachedGuid = await lookupTenantGuid(itemDomain);
          if (cachedGuid) {
            effectiveTenantId = cachedGuid;
          }
        }
      }

      // Cache the mapping and backfill existing items with null tenantId for this domain
      if (effectiveTenantId && parsed.tenantDomain) {
        await learnTenantMapping(effectiveTenantId, parsed.tenantDomain);
      }
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run src/features/history/history.store.test.ts`
Expected: All tests PASS.

**Step 6: Commit**

```bash
git add src/features/history/history.store.ts src/features/history/history.store.test.ts
git commit -m "feat: resolve tenantId at history save time via page context and cache"
```

---

### Task 4: Simplify buildCopyUrl and update tests

Remove the suspect GUID guard and simplify to just use stored tenantId directly.

**Files:**
- Modify: `src/features/bookmarks/url-parser.ts:649-669` (simplify `buildCopyUrl`)
- Modify: `src/features/bookmarks/url-parser.test.ts:540-615` (update tests)

**Step 1: Update tests first**

In `url-parser.test.ts`, replace the entire `describe('buildCopyUrl')` block with:

```typescript
describe('buildCopyUrl', () => {
  const CONTOSO_URL = 'https://portal.azure.com/#@contoso.onmicrosoft.com/resource/subscriptions/sub-123/resourceGroups/rg/providers/Microsoft.Web/sites/my-app';
  const ITEM_GUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  it('injects stored GUID into URL', () => {
    const item = { url: CONTOSO_URL, tenantId: ITEM_GUID };
    const result = buildCopyUrl(item);
    expect(result).toContain(`portal.azure.com/${ITEM_GUID}/`);
  });

  it('returns raw URL when tenantId is null', () => {
    const item = { url: CONTOSO_URL, tenantId: null };
    const result = buildCopyUrl(item);
    expect(result).toBe(CONTOSO_URL);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/bookmarks/url-parser.test.ts`
Expected: FAIL — `buildCopyUrl` signature changed (no longer takes `currentDirectory`).

**Step 3: Simplify buildCopyUrl**

Replace `buildCopyUrl` in `url-parser.ts` (lines 649-669) with:

```typescript
/**
 * Build a URL for copying to clipboard.
 * Uses the item's stored tenantId (resolved at save time) to inject the
 * directory GUID into the URL path for cross-directory navigation.
 *
 * @param item - The bookmark or history entry with a pre-resolved tenantId
 */
export function buildCopyUrl(
  item: { url: string; tenantId: string | null }
): string {
  return item.tenantId ? buildNavigationUrl(item.url, item.tenantId) : item.url;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/bookmarks/url-parser.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/features/bookmarks/url-parser.ts src/features/bookmarks/url-parser.test.ts
git commit -m "refactor: simplify buildCopyUrl — use stored tenantId directly"
```

---

### Task 5: Simplify Overlay.svelte copy logic and tooltips

Update the UI to use the simplified `buildCopyUrl` and remove conditional tooltips.

**Files:**
- Modify: `src/features/overlay/Overlay.svelte:19` (update import)
- Modify: `src/features/overlay/Overlay.svelte:29-35` (simplify `copyItemUrl`)
- Modify: `src/features/overlay/Overlay.svelte:493` (simplify tooltip)

**Step 1: Update import**

Remove `$currentDirectory` dependency from `copyItemUrl`. The import of `buildCopyUrl` stays the same.

**Step 2: Simplify copyItemUrl function**

Replace lines 29-35 with:

```typescript
async function copyItemUrl(item: any, event: MouseEvent) {
  event.stopPropagation();
  const url = buildCopyUrl(item);
  await navigator.clipboard.writeText(url);
  copiedItemId = item.id;
  setTimeout(() => { copiedItemId = null; }, 1500);
}
```

**Step 3: Simplify item copy tooltip**

Replace line 493:
```
title={copiedItemId === item.id ? 'Copied!' : (item.tenantId ? 'Copy URL' : 'Copy URL (GUID unavailable — may not switch directories)')}
```
with:
```
title={copiedItemId === item.id ? 'Copied!' : 'Copy URL'}
```

**Step 4: Build and verify**

Run: `npm run build`
Expected: Clean build, no errors.

**Step 5: Commit**

```bash
git add src/features/overlay/Overlay.svelte
git commit -m "refactor: simplify overlay copy — remove suspect guard and conditional tooltip"
```

---

### Task 6: Run full test suite and build

Verify everything works together.

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS.

**Step 2: Build extension**

Run: `npm run build`
Expected: Clean build in `dist/`.

**Step 3: Bump version**

Increment patch version in both `src/manifest.json` and `package.json` (keep in sync).

**Step 4: Final commit**

```bash
git add src/manifest.json package.json
git commit -m "chore: bump version for copy system fix"
```
