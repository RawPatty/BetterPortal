# Overlay Spec

## Summary

Keyboard-triggered overlay panel for quick navigation. Renders on `portal.azure.com/*`.

## Tech Stack

- Svelte component injected via content script
- TypeScript (relaxed)
- Suggested: `fzy` or `fuzzysort` for search (alternatives OK)

---

## Interfaces

```typescript
interface OverlayState {
  isOpen: boolean;
  searchQuery: string;
  selectedIndex: number;
  filteredItems: DisplayItem[];
  mode: 'navigate' | 'search';
}

interface DisplayItem {
  id: string;
  type: 'bookmark' | 'history';
  displayName: string;
  alias?: string;
  tenantId: string;
  tenantName: string;
  url: string;
  isStale: boolean;
}

interface KeyBinding {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  action: string;
}
```

---

## Behaviors

### Open/Close

- Default hotkey: `Ctrl+Space`
- Hotkey configurable via settings
- `Esc` closes overlay
- Clicking outside closes overlay
- Opening focuses search input in navigate mode

### Keyboard Navigation

| Key | Mode | Action |
|-----|------|--------|
| `j` | navigate | Move selection down |
| `k` | navigate | Move selection up |
| `/` | navigate | Enter search mode, focus input |
| `Enter` | any | Open selected item |
| `Esc` | search | Exit search mode |
| `Esc` | navigate | Close overlay |
| `a` | navigate | Add current page as bookmark |
| `s` | navigate | Snapshot current resource |
| `d` | navigate | Open diff view |

### Search

- Fuzzy match against `displayName`, `alias`, `tenantName`
- Results update as user types
- Empty query shows all items grouped by tenant
- Selection resets to index 0 on query change

### Grouping

- Items grouped by `tenantName`
- Groups collapsible (persist collapse state)
- Current tenant's group expanded by default

### Visual States

- Selected item: highlighted background
- Stale item: muted text + warning icon
- Current page match: subtle indicator

---

## Component Structure

```
Overlay.svelte
├── SearchInput.svelte
├── TenantGroup.svelte
│   └── BookmarkItem.svelte
└── ActionBar.svelte
```

---

## Content Script Integration

- Inject overlay container into `document.body`
- Listen for hotkey on `document`
- Prevent default browser behavior for bound keys when overlay open
- Z-index above Azure portal elements (suggest: 999999)

---

## Test Cases

| Input | Expected |
|-------|----------|
| Press `Ctrl+Space` on portal | Overlay opens, search focused |
| Press `Ctrl+Space` when open | Overlay closes |
| Type "prod" in search | Items matching "prod" shown |
| Press `j` 3 times | 4th item selected (0-indexed) |
| Press `Enter` on item from different tenant | Browser navigates to URL with tenant prefix |
| Press `Esc` in search mode | Search cleared, navigate mode |
| Press `Esc` in navigate mode | Overlay closes |
| Overlay open, click outside | Overlay closes |
| Item marked stale | Shows warning icon, muted style |
