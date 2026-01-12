# Diff Spec

## Summary

Snapshot Azure resource state, compare before/after changes. Uses portal session for ARM API calls.

## Tech Stack

- ARM REST API via fetch
- TypeScript (relaxed)
- Suggested: `diff` or `deep-diff` for object comparison (alternatives OK)
- Suggested: `diff2html` for rendering (alternatives OK)

---

## Interfaces

```typescript
interface Snapshot {
  id: string;
  resourceId: string;
  tenantId: string;
  capturedAt: number;
  armState: Record<string, unknown>;      // GET resource response
  iamAssignments: RoleAssignment[];
  label: string;                           // User-provided or auto "Before"/"After"
}

interface RoleAssignment {
  principalId: string;
  principalName: string;
  roleDefinitionId: string;
  roleName: string;
  scope: string;
}

interface DiffResult {
  snapshotA: Snapshot;
  snapshotB: Snapshot;
  armDiff: PropertyDiff[];
  iamDiff: {
    added: RoleAssignment[];
    removed: RoleAssignment[];
    unchanged: number;
  };
}

interface PropertyDiff {
  path: string;                // JSON path: "properties.siteConfig.appSettings[0].value"
  type: 'added' | 'removed' | 'changed';
  oldValue?: unknown;
  newValue?: unknown;
}

interface SnapshotStore {
  save(snapshot: Snapshot): Promise<void>;
  get(id: string): Promise<Snapshot | null>;
  getByResource(resourceId: string): Promise<Snapshot[]>;
  delete(id: string): Promise<void>;
  deleteByResource(resourceId: string): Promise<void>;
}
```

---

## Behaviors

### Authentication

1. Extract bearer token from portal session:
   ```typescript
   // Option 1: Portal stores token in sessionStorage
   const token = sessionStorage.getItem('...'); // Key varies, inspect portal

   // Option 2: Intercept XHR/fetch requests to ARM
   // Content script observes network, extracts Authorization header

   // Option 3: Use portal's internal API client if exposed
   ```
2. Token used for ARM API calls
3. If token expired/missing, show error: "Please refresh the Azure portal"

### Capture Snapshot

1. User triggers snapshot (`s` key or button)
2. Get current resource ID from URL
3. Fetch ARM resource state:
   ```
   GET https://management.azure.com{resourceId}?api-version=2023-01-01
   Authorization: Bearer {token}
   ```
4. Fetch IAM assignments:
   ```
   GET https://management.azure.com{resourceId}/providers/Microsoft.Authorization/roleAssignments?api-version=2022-04-01
   ```
5. Prompt for label (default: "Snapshot {timestamp}")
6. Save to store

### Compare Snapshots

1. User triggers diff (`d` key or button)
2. Show snapshot picker if multiple exist for resource
3. Default: compare two most recent snapshots
4. Calculate `armDiff`:
   - Deep compare `armState` objects
   - Generate `PropertyDiff` for each difference
   - Ignore noisy fields: `etag`, `lastModifiedTime`, etc.
5. Calculate `iamDiff`:
   - Compare by `principalId + roleDefinitionId + scope`
   - Categorize as added/removed
6. Render diff view

### Diff View

- Modal overlay (separate from main overlay)
- Tabs: "Properties" | "IAM"
- Properties tab: inline diff format
  ```diff
  properties.siteConfig.alwaysOn
  - false
  + true

  properties.siteConfig.appSettings[2]
  + { "name": "NEW_VAR", "value": "xxx" }
  ```
- IAM tab: table with added (green), removed (red) rows
- Close with `Esc` or close button

### Ignored Fields

```typescript
const IGNORED_PATHS = [
  'etag',
  'properties.lastModifiedTimeUtc',
  'properties.provisioningState',  // Often transient
  'systemData',
];
```

---

## Storage Schema

```typescript
// chrome.storage.local keys
{
  'snapshots': Snapshot[],
  'snapshots_version': number,
  'diff_settings': {
    ignoredPaths: string[];
    maxSnapshotsPerResource: number;  // Default: 5
  }
}
```

---

## ARM API Notes

- API versions vary by resource type
- Use resource's latest stable API version
- Handle pagination for IAM (unlikely but possible)
- Rate limits: ~100 requests/minute (be conservative)

---

## Test Cases

| Input | Expected |
|-------|----------|
| Press `s` on resource page | Snapshot captured with ARM state + IAM |
| Press `s` with expired token | Error message shown, no snapshot |
| Press `d` with 0 snapshots | Message: "No snapshots for this resource" |
| Press `d` with 1 snapshot | Message: "Need at least 2 snapshots to compare" |
| Press `d` with 2+ snapshots | Diff view opens comparing latest two |
| ARM property changed | Shows in diff with old/new values |
| IAM role added | Shows in IAM tab as green row |
| IAM role removed | Shows in IAM tab as red row |
| `etag` field changed | Not shown in diff (ignored) |
| 6 snapshots exist (max 5) | Oldest snapshot auto-deleted |
| Close diff view with Esc | Returns to main overlay |
