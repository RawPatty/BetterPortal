# BetterPortal MVP Implementation Plan

## Overview

Chrome extension for fast Azure portal navigation with Svelte UI, Vite build, and ARM API integration.

**Stack**: Svelte + TypeScript + Vite/CRXJS + pnpm + Vitest

---

## Project Structure

```
src/
├── manifest.json
├── background/
│   └── index.ts                 # Service worker
├── content/
│   ├── index.ts                 # Content script entry
│   └── mount.ts                 # Svelte app mount
├── features/
│   ├── overlay/
│   │   ├── Overlay.svelte
│   │   ├── SearchInput.svelte
│   │   ├── TenantGroup.svelte
│   │   ├── BookmarkItem.svelte
│   │   ├── ActionBar.svelte
│   │   ├── overlay.store.ts
│   │   └── overlay.test.ts
│   ├── bookmarks/
│   │   ├── bookmarks.store.ts
│   │   ├── bookmarks.service.ts
│   │   ├── url-parser.ts
│   │   └── bookmarks.test.ts
│   ├── history/
│   │   ├── history.store.ts
│   │   ├── history.observer.ts
│   │   └── history.test.ts
│   ├── diff/
│   │   ├── DiffModal.svelte
│   │   ├── DiffView.svelte
│   │   ├── snapshot.store.ts
│   │   ├── arm-client.ts
│   │   ├── token-extractor.ts
│   │   ├── diff-calculator.ts
│   │   └── diff.test.ts
│   └── settings/
│       ├── SettingsPanel.svelte
│       ├── HotkeyRecorder.svelte
│       ├── settings.store.ts
│       └── settings.test.ts
├── shared/
│   ├── storage.ts               # Chrome storage wrapper
│   ├── types.ts                 # Shared interfaces
│   └── constants.ts
├── popup/
│   ├── index.html
│   └── Popup.svelte
└── styles/
    ├── variables.css            # Theme tokens
    ├── overlay.css
    └── fluent.css               # Azure portal-matching styles
```

---

## Implementation Phases

### Phase 1: Project Setup & Core Navigation (Tasks 1-8)

#### Task 1: Scaffold Project
- Initialize with `pnpm create vite` + Svelte
- Add CRXJS Vite plugin
- Configure manifest.json (MV3)
- Setup TypeScript (moderate strictness)

**Files**: `package.json`, `vite.config.ts`, `tsconfig.json`, `src/manifest.json`

#### Task 2: Chrome Extension Structure
- Content script entry point
- Background service worker
- Popup skeleton
- Permissions: `storage`, `activeTab`, host pattern `*://portal.azure.com/*`

**Files**: `src/background/index.ts`, `src/content/index.ts`, `src/popup/`

#### Task 3: Storage Layer
- Chrome storage wrapper with typed get/set
- Migration support for schema versioning
- Implement stores: bookmarks, history, settings, snapshots

**Files**: `src/shared/storage.ts`, `src/shared/types.ts`

#### Task 4: Overlay Component Shell
- Mount Svelte app into portal DOM
- Z-index above portal (999999)
- Keyboard listener for `Ctrl+Space`
- Open/close state management

**Files**: `src/content/mount.ts`, `src/features/overlay/Overlay.svelte`, `src/features/overlay/overlay.store.ts`

#### Task 5: Vim Keyboard Navigation
- `j`/`k` for up/down
- `Enter` to select
- `Esc` to close
- `/` to focus search
- Mode switching (navigate vs search)

**Files**: `src/features/overlay/Overlay.svelte` (keyboard handler)

#### Task 6: URL Parser & Bookmark Service
- Extract tenantId, resourceId, blade from portal URLs
- Generate displayName from resource path
- Parse tenant domain from URL hash

**Files**: `src/features/bookmarks/url-parser.ts`, `src/features/bookmarks/bookmarks.service.ts`

#### Task 7: Bookmark CRUD
- Save current page as bookmark
- List bookmarks grouped by tenant
- Delete bookmark
- Update alias

**Files**: `src/features/bookmarks/bookmarks.store.ts`

#### Task 8: Search & Filtering
- Fuzzy search across displayName, alias, tenantName
- Update results on keypress
- Highlight matches

**Files**: `src/features/overlay/SearchInput.svelte`, add `fuzzysort` dependency

---

### Phase 2: History & Polish (Tasks 9-14)

#### Task 9: History Observer
- Override `history.pushState` + `popstate` listener
- Debounce navigation (2s)
- Capture resource pages only

**Files**: `src/features/history/history.observer.ts`

#### Task 10: History Store
- Auto-capture entries
- Upsert by resourceId+tenantId
- Increment visitCount
- Retention/pruning logic

**Files**: `src/features/history/history.store.ts`

#### Task 11: History in Overlay
- "Recent History" collapsible section
- Promote to bookmark action (`a` key)
- Sorted by visitedAt

**Files**: Update `src/features/overlay/Overlay.svelte`

#### Task 12: Stale Detection
- Check bookmark accessibility on overlay open (optional/async)
- Mark isStale on 404/403
- Visual indicator (muted + warning icon)

**Files**: `src/features/bookmarks/bookmarks.service.ts`

#### Task 13: Theming
- CSS variables for light/dark themes
- Apply theme class on overlay container
- Light theme: match Azure Fluent UI colors

**Files**: `src/styles/variables.css`, `src/styles/fluent.css`

#### Task 14: Export/Import
- Export all data as JSON
- Import with merge strategy
- Trigger download via blob URL

**Files**: `src/features/settings/SettingsPanel.svelte`, update stores

---

### Phase 3: Diff Feature (Tasks 15-20)

#### Task 15: Token Extraction (PRIORITY)
- Intercept fetch/XHR to ARM endpoints
- Extract Authorization header
- Cache token with expiry detection
- Fallback error message

**Files**: `src/features/diff/token-extractor.ts`

#### Task 16: ARM Client
- Fetch resource state from ARM API
- Fetch IAM role assignments
- Handle API versioning per resource type
- Rate limiting/backoff

**Files**: `src/features/diff/arm-client.ts`

#### Task 17: Snapshot Store
- Save/retrieve snapshots
- Max 5 per resource (auto-prune oldest)
- Label with timestamp

**Files**: `src/features/diff/snapshot.store.ts`

#### Task 18: Diff Calculator
- Deep object comparison
- Generate PropertyDiff array
- Filter ignored paths (etag, systemData, etc.)
- IAM diff (added/removed)

**Files**: `src/features/diff/diff-calculator.ts`, add `deep-diff` dependency

#### Task 19: Diff Modal UI
- Modal overlay (separate from main overlay)
- Tabs: Properties | IAM
- Inline diff rendering
- Close with Esc

**Files**: `src/features/diff/DiffModal.svelte`, `src/features/diff/DiffView.svelte`

#### Task 20: Snapshot Actions
- `s` key to capture snapshot
- `d` key to show diff
- Snapshot picker if multiple exist
- Error states for missing token/snapshots

**Files**: Update `src/features/overlay/ActionBar.svelte`

---

### Phase 4: Settings & Final Polish (Tasks 21-24)

#### Task 21: Settings Panel
- Hotkey configuration with recorder
- History enable/disable, retention
- Theme selector
- Diff ignored paths

**Files**: `src/features/settings/SettingsPanel.svelte`, `src/features/settings/HotkeyRecorder.svelte`

#### Task 22: Popup UI
- Quick access to settings
- Export/Import buttons
- Version info

**Files**: `src/popup/Popup.svelte`

#### Task 23: Testing
- Unit tests for stores (Vitest)
- Unit tests for url-parser, diff-calculator
- Component tests for overlay (Testing Library)

**Files**: `*.test.ts` files per feature

#### Task 24: Build & Package
- Production build config
- Generate .crx / .zip for Chrome Web Store
- README with install instructions

**Files**: `vite.config.ts`, `README.md`

---

## Dependencies

```json
{
  "dependencies": {
    "fuzzysort": "^3.0.0"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.0.0-beta",
    "@sveltejs/vite-plugin-svelte": "^3.0.0",
    "@testing-library/svelte": "^5.0.0",
    "deep-diff": "^1.0.2",
    "svelte": "^4.0.0",
    "typescript": "^5.0.0",
    "vite": "^5.0.0",
    "vitest": "^2.0.0"
  }
}
```

---

## Key Implementation Notes

### Token Extraction Strategy
```typescript
// Intercept fetch to ARM endpoints
const originalFetch = window.fetch;
window.fetch = async (input, init) => {
  const response = await originalFetch(input, init);
  if (input.toString().includes('management.azure.com')) {
    const authHeader = init?.headers?.['Authorization'];
    if (authHeader) cacheToken(authHeader);
  }
  return response;
};
```

### URL Parsing Patterns
```typescript
const TENANT_ID_REGEX = /portal\.azure\.com\/([a-f0-9-]{36})/;
const TENANT_DOMAIN_REGEX = /#@([^/]+)/;
const RESOURCE_ID_REGEX = /\/resource\/([^?#]+)/;
```

### Manifest V3 Permissions
```json
{
  "manifest_version": 3,
  "permissions": ["storage", "activeTab"],
  "host_permissions": ["*://portal.azure.com/*"],
  "content_scripts": [{
    "matches": ["*://portal.azure.com/*"],
    "js": ["src/content/index.ts"]
  }]
}
```

---

## Verification

### Manual Testing Checklist
- [ ] `Ctrl+Space` opens overlay on portal.azure.com
- [ ] `j`/`k` navigates list, `Enter` opens bookmark
- [ ] Bookmark saves current resource with correct tenant
- [ ] Navigation to different tenant auto-switches
- [ ] History auto-captures after 2s on resource pages
- [ ] Snapshot captures ARM state (check token extraction)
- [ ] Diff shows property changes between snapshots
- [ ] Export downloads valid JSON
- [ ] Import merges without duplicates
- [ ] Theme switching works

### Automated Tests
```bash
pnpm test           # Run Vitest
pnpm test:watch     # Watch mode
pnpm build          # Production build
```

---

## Risk Mitigations

| Risk | Mitigation |
|------|------------|
| Token extraction fails | Multiple strategies (fetch intercept, sessionStorage, XHR) |
| Portal DOM changes | Minimal DOM dependency, fallback selectors |
| CRXJS beta issues | Pin version, fallback to manual Rollup if needed |
| Storage quota | Prune history/snapshots aggressively |

---

## Estimated Task Breakdown

| Phase | Tasks | Complexity |
|-------|-------|------------|
| 1: Setup & Core Nav | 8 | Medium |
| 2: History & Polish | 6 | Low-Medium |
| 3: Diff Feature | 6 | High (token extraction) |
| 4: Settings & Polish | 4 | Low |
| **Total** | **24** | |

---

## Next Steps

1. Run `pnpm create vite betterportal --template svelte-ts`
2. Add CRXJS plugin and configure manifest
3. Implement Task 1-4 to get basic overlay working
4. Iterate through remaining tasks
