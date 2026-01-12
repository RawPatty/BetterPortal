# BetterPortal - Product Requirements Document

## Overview

**Product Name**: BetterPortal
**Version**: 1.0 (MVP)
**Form Factor**: Chrome Browser Extension

### Problem Statement

Azure portal users face significant friction when navigating between resources:

1. **Portal Performance**: The Azure portal is slow to load, making each navigation action costly
2. **Navigation Depth**: Returning to a previously visited resource or blade requires multiple clicks
3. **Multi-Tenant Friction**: Switching between Azure directories (4-10 tenants is common) compounds the load time problem with additional click overhead
4. **No Quick Access**: The portal's "recently visited" feature requires navigating to the homepage first

### Solution

BetterPortal is a Chrome extension that provides instant access to saved Azure resource locations via a keyboard-triggered overlay. It remembers exact blade positions, handles directory switching automatically, and provides before/after diffing for validating infrastructure changes.

---

## Target Users

- Azure professionals managing multiple tenants (4-10 directories)
- DevOps engineers validating infrastructure changes
- Platform engineers frequently accessing IAM and configuration blades
- Developers working across multiple Azure subscriptions

---

## Core Features (MVP)

### 1. Quick Access Overlay

**Trigger**: `Ctrl+Space` (customizable)

- Vim-style keyboard navigation (`j`/`k` to move, `Enter` to select, `/` to search)
- Type-ahead search filtering across all saved locations
- Organized by directory/tenant by default
- Fluent UI styling to match Azure portal aesthetic

### 2. Resource Bookmarking

**Save Mechanism**:
- Explicit save via overlay UI or keyboard shortcut
- Auto-capture browsing history (promotable to permanent bookmark)

**Bookmark Data**:
- Resource URL with full blade path
- Directory/Tenant ID
- Auto-generated name from resource (e.g., "my-app-service > Configuration > Application Settings")
- Optional custom alias override
- Configurable state depth per bookmark:
  - Full blade state (deep link to exact tab/section)
  - Resource level only (land on overview)

### 3. One-Click Directory Switching

- Bookmarks include tenant context
- Clicking a bookmark in a different tenant auto-switches directory
- URL pattern: `portal.azure.com/{tenantId}/#@{tenantDomain}/resource/...`
- No manual directory switching required

### 4. Before/After Diff

**Use Case**: Validate infrastructure changes pre/post deployment

**Workflow**:
1. Navigate to resource, trigger "Snapshot" action
2. Make infrastructure changes (deploy, terraform apply, etc.)
3. Trigger "Compare" action
4. View inline diff of resource state changes

**Data Sources** (via portal session token):
- ARM resource properties (JSON)
- IAM role assignments
- Resource state/status

**Display**: Inline diff format highlighting additions, removals, and modifications

### 5. History & Organization

**Auto-History**:
- Track visited Azure resources automatically
- Searchable history log
- Promote history items to permanent bookmarks

**Organization**:
- Flat list with search (MVP default)
- Grouped by directory/tenant
- Future: Optional folders, groups, and tags

### 6. Data Persistence

**Storage**: Chrome local storage (IndexedDB)

**Export**: JSON export of all bookmarks and settings

**Future (Paid)**: Cloud sync across devices

---

## User Interface

### Overlay Panel

```
┌─────────────────────────────────────────────────┐
│  🔍 Search bookmarks...                    [/]  │
├─────────────────────────────────────────────────┤
│  ▼ Contoso Production (tenant-id-1)             │
│    ├─ my-api-app > Configuration           [1]  │
│    ├─ my-api-app > Identity (IAM)          [2]  │
│    └─ prod-keyvault > Access Policies      [3]  │
│                                                 │
│  ▼ Contoso Dev (tenant-id-2)                    │
│    ├─ dev-app-service > Deployment Slots   [4]  │
│    └─ dev-storage > Containers             [5]  │
│                                                 │
│  ▸ Recent History                               │
├─────────────────────────────────────────────────┤
│  [S] Snapshot  [D] Diff  [+] Save Current       │
└─────────────────────────────────────────────────┘
```

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+Space` | Open/close overlay |
| `j` / `k` | Navigate down/up |
| `Enter` | Open selected bookmark |
| `/` | Focus search |
| `Esc` | Close overlay |
| `s` | Snapshot current resource |
| `d` | Show diff (if snapshot exists) |
| `a` | Add current page as bookmark |

### Visual States

- **Active bookmark**: Normal display
- **Stale/Inaccessible**: Visual indicator (muted color, warning icon), kept in list
- **Currently viewing**: Highlighted in list

---

## Technical Architecture

### Authentication

- Piggyback existing Azure portal session
- Extract bearer token from portal's authenticated context
- Use token for ARM API calls (read-only for monitoring/diff)
- No additional login required

### Data Model

```typescript
interface Bookmark {
  id: string;
  url: string;
  tenantId: string;
  tenantDisplayName: string;
  resourceId: string;  // ARM resource ID
  displayName: string; // Auto-generated
  alias?: string;      // User override
  stateDepth: 'full' | 'resource';
  createdAt: Date;
  lastAccessed: Date;
  isStale: boolean;
}

interface Snapshot {
  id: string;
  bookmarkId: string;
  resourceState: object;  // ARM JSON
  iamAssignments: object[];
  capturedAt: Date;
}

interface Settings {
  hotkey: string;
  theme: 'portal' | 'dark' | 'light';
  autoCapture: boolean;
  historyRetentionDays: number;
}
```

### Chrome Extension Components

1. **Content Script**: Injected into `portal.azure.com/*`
   - Renders overlay UI
   - Captures current page context
   - Intercepts keyboard shortcuts

2. **Background Service Worker**:
   - Manages storage
   - Handles ARM API calls
   - Processes diff calculations

3. **Popup** (minimal): Settings access, export functionality

---

## Out of Scope (MVP)

| Feature | Rationale | Target Version |
|---------|-----------|----------------|
| Multi-browser support | Focus on Chrome first | v1.1 |
| Cloud sync | Requires backend infrastructure | v2.0 (Paid) |
| Live polling/monitoring | Complex, before/after diff covers core use case | v2.0 |
| Auto-detect related resources | Requires ARM graph traversal | v1.2 |
| Advanced folder/tag organization | Flat list + search sufficient for MVP | v1.1 |
| Firefox/Edge support | Manifest V3 compatible, but Chrome priority | v1.1 |

---

## Success Metrics

1. **Navigation Time Reduction**: Measure clicks/time to reach saved resources vs. native portal
2. **Daily Active Usage**: Overlay invocations per user per day
3. **Bookmark Volume**: Average bookmarks per user
4. **Tenant Coverage**: % of user's tenants with saved bookmarks
5. **Diff Feature Adoption**: % of users using before/after diff

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Portal session token expiry | Diff/monitoring fails | Graceful fallback, prompt user to refresh portal |
| Azure portal DOM changes | Content script breaks | Abstract DOM interactions, monitor for portal updates |
| ARM API rate limits | Diff feature throttled | Cache responses, batch requests, implement backoff |
| Manifest V3 restrictions | Background script limitations | Use service worker patterns, chrome.storage APIs |

---

## Implementation Phases

### Phase 1: Core Navigation
- Overlay UI with keyboard navigation
- Manual bookmark save/delete
- Directory-grouped list with search
- One-click navigation with tenant switching

### Phase 2: History & Polish
- Auto-capture browsing history
- Configurable state depth
- Custom aliases
- Stale resource detection
- Export functionality

### Phase 3: Diff Feature
- Snapshot capture via ARM API
- Before/after comparison
- Inline diff visualization

### Phase 4: Future Enhancements (Post-MVP)
- Cloud sync (paid tier)
- Multi-browser support
- Live polling dashboard
- Related resource detection
- Advanced organization (folders, tags)

---

## Appendix

### Key Azure Portal URL Patterns

```
# Standard resource blade
https://portal.azure.com/#@{tenant}/resource/{resourceId}/{blade}

# With tenant ID prefix
https://portal.azure.com/{tenantId}/#@{tenantDomain}/resource/...

# IAM blade
.../resource/{resourceId}/users

# App Service Configuration
.../resource/{resourceId}/configuration

# Key Vault Access Policies
.../resource/{resourceId}/accessPolicies
```

### Pain Point Examples

1. **IAM Navigation**: Resource Group > Access Control (IAM) > Role Assignments > Add > Search user > Select role > Save (6+ clicks minimum)

2. **Cross-Resource**: App Service > Configuration > Click Key Vault reference > Opens new tab > Different tenant? > Switch directory > Reload > Navigate again

3. **Return Navigation**: Close browser > Reopen > Portal home > Recent? Maybe not there > Search resource > Click > Navigate to blade > 5+ page loads
