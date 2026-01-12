# History Spec

## Summary

Auto-capture visited Azure resources. Searchable, promotable to bookmarks.

## Tech Stack

- Chrome `storage.local` API
- Content script page observer
- TypeScript (relaxed)

---

## Interfaces

```typescript
interface HistoryEntry {
  id: string;
  url: string;
  tenantId: string;
  tenantName: string;
  resourceId: string;
  displayName: string;
  visitedAt: number;           // Unix timestamp
  visitCount: number;
}

interface HistoryStore {
  getRecent(limit: number): Promise<HistoryEntry[]>;
  getByTenant(tenantId: string, limit: number): Promise<HistoryEntry[]>;
  search(query: string, limit: number): Promise<HistoryEntry[]>;
  add(entry: Omit<HistoryEntry, 'id' | 'visitCount'>): Promise<void>;
  clear(): Promise<void>;
  prune(olderThanDays: number): Promise<number>;  // Returns deleted count
}

interface HistorySettings {
  enabled: boolean;
  retentionDays: number;       // Default: 30
  maxEntries: number;          // Default: 500
}
```

---

## Behaviors

### Auto-Capture

1. Content script observes URL changes (SPA navigation)
2. Debounce: wait 2s after navigation settles
3. Skip if URL is not a resource page (`/resource/` not in path)
4. Extract: URL, tenantId, tenantName, resourceId, displayName
5. Upsert by `resourceId + tenantId`:
   - Existing: update `visitedAt`, increment `visitCount`
   - New: create entry with `visitCount: 1`

### URL Change Detection

```typescript
// Options (pick one):
// 1. MutationObserver on URL-displaying element
// 2. setInterval polling location.href
// 3. Override history.pushState/replaceState

// Recommended: history API override + popstate listener
const originalPushState = history.pushState;
history.pushState = function(...args) {
  originalPushState.apply(this, args);
  window.dispatchEvent(new Event('urlchange'));
};
window.addEventListener('popstate', () => {
  window.dispatchEvent(new Event('urlchange'));
});
```

### Storage Limits

- Max entries: configurable, default 500
- When limit reached: remove oldest by `visitedAt`
- Retention: auto-prune entries older than `retentionDays`
- Prune runs on extension startup

### Promote to Bookmark

1. User selects history entry in overlay
2. Press `a` or click "Save" action
3. Convert to Bookmark (see bookmarks.md)
4. History entry remains (separate stores)

### Display in Overlay

- History items appear in "Recent" section (collapsed by default)
- Sorted by `visitedAt` descending
- Show `visitCount` as subtle indicator for frequently accessed
- Same search applies to history + bookmarks

---

## Storage Schema

```typescript
// chrome.storage.local keys
{
  'history': HistoryEntry[],
  'history_settings': HistorySettings,
  'history_version': number
}
```

---

## Test Cases

| Input | Expected |
|-------|----------|
| Navigate to resource page, wait 2s | History entry created |
| Navigate to same resource again | `visitCount` incremented, `visitedAt` updated |
| Navigate to non-resource page (home, settings) | No history entry created |
| 501 entries exist (max 500) | Oldest entry removed |
| Entry is 31 days old (retention 30) | Entry pruned on startup |
| Promote history entry to bookmark | Bookmark created, history entry unchanged |
| Search "keyvault" | Matches in both bookmarks and history returned |
| Disable history in settings | No new entries captured |
| Clear history | All entries removed, bookmarks unchanged |
