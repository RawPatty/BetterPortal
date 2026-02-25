Use vitest to test your features and write sensible tests for each bug you end up fixing

## Release Process

When making updates:
- **Bump the version** in both `src/manifest.json` and `package.json` (keep them in sync)
- **Push to GitHub** after committing changes

## How to Add Features

**You don't need a new PRD/spec each time.** Just describe what you want.

| Size | Example | How to Engage |
|------|---------|---------------|
| **Small** | "Add a copy URL button" | Just ask. I'll implement directly. |
| **Medium** | "Add keyboard shortcut customization" | Describe it. I'll ask clarifying questions, then implement. |
| **Large** | "Add resource diffing" | Say "I want to add X". I'll enter plan mode, explore codebase, draft approach, get approval first. |

**What helps:**
- **What** you want (the outcome)
- **Why** if not obvious (helps make better decisions)
- **Any constraints** (e.g., "don't change existing UI", "must work offline")

**You don't need to provide:**
- Detailed specs (I'll ask if unclear)
- File locations (I'll find them)
- Implementation details (unless you have a preference)

**Reference docs:**
- `CLAUDE.md` - patterns, learnings, bug fixes
- Plan file - feature roadmap, architecture decisions, verification checklist

## Regression Prevention

When fixing bugs or adding features:
- **Never remove working functionality** - fixes must coexist with existing features
- **Understand the full context** before changing code - trace how the code is used across the codebase
- **Consider side effects** - if a function/variable is used in multiple places, changes affect all of them
- **Test both the fix AND existing features** - verify the fix works without breaking what was already working
- **Separate concerns** - if one field serves multiple purposes (e.g., tenantId for both grouping AND navigation), consider using separate fields for each purpose instead of choosing one over the other

## Architecture Decisions & Learnings

### Tenant Handling (Critical)
The extension supports multiple Azure AD tenants/directories. Two separate concerns:

1. **Grouping/Display** (`tenantName`): Use the domain from URL hash (e.g., `contoso.onmicrosoft.com`) or DOM. Stable and consistent for grouping bookmarks/history by tenant. Note: `getTenantNameFromDOM()` tries to extract the domain from "Display Name (domain.com)" format — if it can't find the parenthesized part it returns the raw display text, so `tenantName` is NOT always a proper domain.

2. **Navigation** (`tenantId`): MUST be a GUID or null. Never store domain as tenantId.

#### GUID Resolution Cascade (bookmarks.store.ts + history.store.ts)

At save time, `effectiveTenantId` is resolved by walking this cascade in order:

| Step | Source | Guard | Notes |
|------|--------|-------|-------|
| 1 | URL path GUID | none — always trust | `portal.azure.com/{GUID}/...` |
| 2 | `getAuthenticatedTenantGuid()` | same-directory only | Reads `data-betterportal-current-tenant` on `<html>`, written by fetch interception in `page-context.ts` |
| 3 | `getTenantGuidFromPortal()` | same-directory + `isGuidValidForDomain` | `window.Portal.tenant.id` via event/DOM; can be stale after directory switch |
| 4 | `getGuidForDomain(domain)` | `isGuidValidForDomain` | MSAL sessionStorage token scan; domain matched via UPN/idp/tid claims |
| 5 | `lookupTenantGuid(domain)` | `isGuidValidForDomain`; if invalid → `removeTenantMappingEntry` | Cached domain→GUID mapping |
| 6 | null | — | `learnTenantMapping` backfill self-heals when a URL-with-GUID is later visited |

**`isGuidValidForDomain(guid, domain)`** — returns `false` if the GUID is in cache mapped to a different domain OR multiple domains (indicates cache corruption from old buggy saves). Exported from `bookmarks.store.ts`.

**`learnTenantMapping(guid, domain)`** — private in each store; calls `updateTenantMapping` + backfills existing null-tenantId items for the same domain.

#### Fetch Interception (page-context.ts — MAIN world)

`page-context.ts` monkey-patches `window.fetch` to observe POST requests to `login.microsoftonline.com/{GUID}/oauth2/v2.0/token`. The GUID is extracted from the URL path (not the response body) and written to `document.documentElement.setAttribute('data-betterportal-current-tenant', guid)`.

Two seeding paths cover sessions where no new token fetch occurs (valid cached session):
1. **Immediate seed on load** — calls `extractGuid()` (`window.Portal.tenant.id` etc.) at `document_idle`
2. **Lazy seed via event** — when `betterportal:get-tenant` fires (step 3 cascade call), also seeds `data-betterportal-current-tenant` if not yet set by fetch

Both guards: never overwrite a fetch-intercepted value (`hasAttribute` check). The fetch-intercepted value is authoritative after directory switches.

**Why fetch URL is more reliable than `window.Portal.tenant.id`:**
- `window.Portal.tenant.id` returns the *authenticated* tenant GUID but can be stale after directory switches (the page JS context lags behind the actual navigation)
- The GUID in the OAuth2 token endpoint URL is always exactly the tenant being authenticated to — no JWT parsing, no domain matching, no staleness risk

#### Navigation (navigateToItem)

`navigateToItem(url, tenantId, tenantName)` in `bookmarks.store.ts`:
- Trusts the **stored `tenantId` directly** if it passes `GUID_REGEX` — same as `buildCopyUrl`. Do NOT add `isGuidValidForDomain` here; `tenantName` may be a display name that won't match cache keys.
- Falls back to `lookupTenantGuid(domain)` + `isGuidValidForDomain` when `tenantId` is null
- Only injects GUID when `!sameDirectory && tenantGuid` — same-directory navigation uses the raw URL

### URL Format (Critical for Cross-Tenant Navigation)
**Correct format for cross-tenant navigation:**
```
https://portal.azure.com/{tenantGUID}/#@{domain}/resource/{resourceId}
```

**BOTH parts are required:**
- `{tenantGUID}` in path: Authenticates you to the directory (switches tenant)
- `#@{domain}/resource/...`: Navigates to the actual resource

**Example:**
```
https://portal.azure.com/12345678-1234-1234-1234-123456789abc/#@contoso.onmicrosoft.com/resource/subscriptions/sub-123/resourceGroups/rg-test/providers/Microsoft.Web/sites/my-app
```

**Rules:**
- `buildNavigationUrl()` injects GUID into path while PRESERVING the `#@domain` hash
- `navigateToItem` trusts the stored `tenantId` directly (GUID_REGEX check only) — same as `buildCopyUrl`. Do NOT re-validate with `isGuidValidForDomain`; `tenantName` may be a display name, not a domain.
- The `#@domain` format alone (without GUID in path) does NOT switch directories - it assumes you're already there

### Display Names
- **Subscriptions show GUIDs in URLs** - detect GUID pattern and prefer DOM name
- **Resource hierarchy**: Use `extractDisplayName()` which returns `resourceName | subPath | container` format
- DOM names are extracted after a delay (`DOM_EXTRACTION_DELAY_MS`) to allow page render

### List Selection & Deletion
- **Never use positional index** for operations when items can be grouped/filtered differently
- Use **ID-based lookup**: `flatItems.findIndex(fi => fi.id === item.id)`
- The overlay groups items by tenant, but `filteredItems` has a flat order - these can differ

### CSS/Overlay Issues
- Root container `#betterportal-root` has `pointer-events: none` to not block portal
- Child elements that need interaction MUST have `pointer-events: auto`
- Settings panel is a sibling to `.bp-overlay`, needs its own pointer-events

### Content Script Isolation
- Content scripts run in an **isolated JavaScript context** - they share DOM but NOT `window` objects
- `window.Portal`, `window.fx`, etc. are on the PAGE's window, invisible to content scripts
- To access page variables: inject a `<script>` tag that runs in page context, writes result to DOM attribute
- `sessionStorage`/`localStorage` ARE shared with the page
- See `extractTenantFromPageContext()` for the injection pattern

### URL Parsing
- Azure Portal URLs can be URL-encoded (`%2F` for `/`, `%24` for `$`)
- Storage container paths have special format: `/path/%24web/etag/...`
- Always try decoding URLs before parsing
- `parsePortalUrl()` extracts: `tenantId` (GUID), `tenantDomain`, `resourceId`, `blade`

## Common Bug Patterns

| Symptom | Likely Cause | Solution |
|---------|--------------|----------|
| All items grouped under one tenant | Using wrong field for grouping, or tenant detection returning same value | Group by `tenantName`, ensure domain extraction works |
| Clicking tenant doesn't switch | URL missing tenant GUID in path | Inject GUID: `portal.azure.com/{guid}/...` |
| Wrong item deleted/selected | Positional index mismatch between grouped and flat views | Use ID-based lookup |
| Clicks pass through overlay | Missing `pointer-events: auto` on interactive elements | Add to modal/panel CSS |
| Subscription shows GUID | DOM name not being used | Detect GUID pattern, prefer DOM name |
| Tenant switch works once then fails | Stale GUID in cache mapped to multiple domains | `isGuidValidForDomain` rejects multi-domain GUIDs; `removeTenantMappingEntry` self-heals on next visit |
| All items get the same tenantId (wrong GUID) | Step 3/4 returning authenticated-tenant GUID for a different tenant | `isGuidValidForDomain` staleness check will reject it; verify cascade order and `isSameDirectory` guard on steps 2–3 |
| Cross-tenant navigation doesn't inject GUID | `tenantId` is null (cascade fell through) or `navigateToItem` not finding it | Check cascade saved a GUID; for display-name `tenantName`, ensure stored `tenantId` is a GUID (it will be used directly) |

