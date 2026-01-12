# Bookmarks Spec

## Summary

Save, organize, and retrieve Azure resource locations with tenant context and configurable depth.

## Tech Stack

- Chrome `storage.local` API
- TypeScript (relaxed)
- Suggested: `idb-keyval` for IndexedDB wrapper (alternatives OK)

---

## Interfaces

```typescript
interface Bookmark {
  id: string;                    // crypto.randomUUID()
  url: string;                   // Full portal URL
  tenantId: string;              // GUID
  tenantName: string;            // Display name
  resourceId: string;            // ARM resource ID extracted from URL
  displayName: string;           // Auto-generated
  alias: string | null;          // User override
  stateDepth: 'full' | 'resource';
  createdAt: number;             // Unix timestamp
  lastAccessed: number;          // Unix timestamp
  accessCount: number;
  isStale: boolean;
}

interface BookmarkStore {
  getAll(): Promise<Bookmark[]>;
  getByTenant(tenantId: string): Promise<Bookmark[]>;
  get(id: string): Promise<Bookmark | null>;
  save(bookmark: Bookmark): Promise<void>;
  update(id: string, partial: Partial<Bookmark>): Promise<void>;
  delete(id: string): Promise<void>;
  export(): Promise<string>;     // JSON string
  import(json: string): Promise<{ added: number; skipped: number }>;
}
```

---

## Behaviors

### Save Bookmark

1. Extract from current page:
   - URL (full path including blade)
   - Tenant ID from URL pattern: `portal.azure.com/{tenantId}/#@...` or `#@{tenantDomain}`
   - Tenant display name from portal DOM (`.fxs-avatarmenu-tenant-name`) or fallback to ID
   - Resource ID from URL path segment after `/resource/`
2. Generate `displayName`:
   - Parse resource ID: extract resource name + type
   - Append blade name if `stateDepth: 'full'`
   - Format: `{resourceName} > {bladeName}` or just `{resourceName}`
3. Prompt for optional alias (can skip)
4. Default `stateDepth: 'full'`
5. Save to store

### URL Patterns

```
# Extract tenant
/(?:portal\.azure\.com\/)([a-f0-9-]{36})/  -> tenantId as GUID
/#@([^/]+)/                                 -> tenantDomain

# Extract resource ID
/resource\/([^?#]+)/                        -> resourceId

# Extract blade
/resource\/[^/]+\/([^?#]+)$/               -> bladeName
```

### State Depth

- `full`: Save complete URL as-is
- `resource`: Strip blade suffix, keep `/resource/{resourceId}` only

### Navigation

1. Get bookmark URL
2. If `stateDepth: 'resource'`, use base resource URL
3. Inject tenant ID if not present: `portal.azure.com/{tenantId}/#@...`
4. Update `lastAccessed`, increment `accessCount`
5. Navigate: `window.location.href = url`

### Stale Detection

- On overlay open, check accessibility (optional, can be deferred)
- Mark `isStale: true` if resource returns 404 or 403
- Keep in list, show visual indicator
- User can manually delete

### Export/Import

- Export: JSON array of all bookmarks
- Import: Merge by `resourceId + tenantId` key
  - Skip duplicates
  - Add new entries
  - Return count summary

---

## Storage Schema

```typescript
// chrome.storage.local keys
{
  'bookmarks': Bookmark[],
  'bookmarks_version': number  // For migrations
}
```

---

## Test Cases

| Input | Expected |
|-------|----------|
| Save on `portal.azure.com/abc-123/#@contoso.com/resource/subs/.../sites/myapp/configuration` | Bookmark created with tenantId=abc-123, displayName="myapp > configuration" |
| Save same resource twice | Second save updates existing (by resourceId+tenantId) |
| Navigate to bookmark in different tenant | URL includes tenant ID, browser navigates |
| Export bookmarks | Valid JSON array returned |
| Import JSON with 3 new, 2 duplicate | Returns `{ added: 3, skipped: 2 }` |
| Bookmark with `stateDepth: 'resource'` | Navigation goes to resource overview, not blade |
| Update alias to "My API" | `displayName` unchanged, `alias` set, overlay shows alias |
| Delete bookmark | Removed from store, not in overlay |
