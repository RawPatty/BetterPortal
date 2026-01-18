Use vitest to test your features and write sensible tests for each bug you end up fixing

## Release Process

When making updates:
- **Bump the version** in `src/manifest.json` before committing
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

1. **Grouping/Display** (`tenantName`): Use the domain from URL hash (e.g., `contoso.onmicrosoft.com`) or DOM. This is stable and consistent for grouping bookmarks/history by tenant.

2. **Navigation** (`tenantId`): MUST be a GUID or null. Never store domain as tenantId.
   - **ONLY trust GUID from URL path** - this is the only reliable source
   - If URL has GUID in path, cache the domain→GUID mapping for future lookups
   - If URL has no GUID in path, set tenantId to null (don't try cache/MSAL - they're unreliable)

**Why not trust cache or MSAL tokens?**
- MSAL caches tokens for ALL tenants user has authenticated to
- After switching directories, MSAL may return a GUID from a different tenant
- Cached mappings can become stale if the same domain maps to different GUIDs in different contexts
- Using wrong GUID causes ERR_INVALID_RESPONSE errors

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
- Only trust GUID from URL path (when present) - cache and MSAL tokens are unreliable after directory switches
- If URL has no GUID in path, store tenantId as null (cross-tenant navigation won't work, but same-tenant will)
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
| Tenant switch works once then fails | Cached tenant GUID from first extraction | Never cache extracted GUID - always re-extract (user may switch tenants) |
| tenantId stored as domain, not GUID | `getTenantGuidFromPortal()` returned null | Check console logs; may need to inject script into page context for window objects |

