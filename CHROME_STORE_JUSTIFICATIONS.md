# Chrome Web Store Permission Justifications

This document provides justification for all permissions requested by the BetterPortal extension.

## Required Permissions

### 1. Storage Permission

**Requested in manifest.json:**
```json
"permissions": ["storage"]
```

**Justification:**
The extension stores user data locally on their device using Chrome's storage API. This includes:

- **Bookmarks**: User-created bookmarks to Azure Portal resources
  - Bookmark URL, display name, tenant information, timestamps
  - Stored in `chrome.storage.local` as JSON
  - Location: `src/features/bookmarks/bookmarks.store.ts`

- **History**: Automatically captured navigation history
  - Visited resource URLs, visit counts, timestamps
  - Stored in `chrome.storage.local` as JSON
  - Location: `src/features/history/history.store.ts`

- **Settings**: User preferences and configuration
  - Keyboard shortcuts, theme preference, retention period
  - Stored in `chrome.storage.local` as JSON
  - Location: `src/features/settings/settings.store.ts`


**Data Privacy:**
- All data is stored locally on the user's device
- No data is sent to external servers
- No telemetry or analytics
- Users can export/import their data as JSON files

---

### 2. ActiveTab Permission

**Requested in manifest.json:**
```json
"permissions": ["activeTab"]
```

**Justification:**
The extension needs to access the current tab's URL to bookmark the Azure Portal resource the user is viewing.

**Specific Use Cases:**

1. **Bookmarking Current Page** (Keyboard: `a`)
   - Reads `window.location.href` to get the current resource URL
   - Extracts resource ID, tenant ID, and display name from the URL
   - Location: `src/features/bookmarks/bookmarks.store.ts` (function `saveCurrentPage`)

2. **Extracting Resource Information**
   - Parses the URL to identify the Azure resource type and path
   - Reads DOM elements (with user permission via content script) to get friendly resource names
   - Location: `src/features/bookmarks/url-parser.ts`

**Scope:**
- Only accesses the URL when user explicitly bookmarks a page
- Does not track browsing history outside portal.azure.com
- Only reads URL and DOM content, never modifies the page

---

### 3. Host Permissions (portal.azure.com)

**Requested in manifest.json:**
```json
"host_permissions": ["*://portal.azure.com/*"],
"content_scripts": [{
  "matches": ["*://portal.azure.com/*"],
  "js": ["src/content/index.ts"],
  "run_at": "document_idle"
}]
```

**Justification:**
The extension only works on Azure Portal pages and requires content script injection to provide its core functionality.

**Why Content Script is Needed:**

1. **Overlay UI Injection**
   - Injects the bookmark/history overlay into the portal page
   - Allows users to press `Ctrl+Space` to quickly navigate
   - Location: `src/content/mount.ts`

2. **Automatic History Tracking**
   - Monitors URL changes within the Azure Portal SPA (Single Page Application)
   - Azure Portal uses client-side routing, so standard browser history events don't fire
   - Captures resource visits for history feature
   - Location: `src/features/history/history.observer.ts`

3. **Extract Friendly Resource Names**
   - Azure Portal URLs contain resource IDs (GUIDs), not user-friendly names
   - Reads DOM to extract the human-readable resource name shown in the portal
   - Example: URL has GUID `12345-abcd`, DOM shows "MyProductionApp"
   - Location: `src/features/bookmarks/url-parser.ts` (function `getResourceNameFromDOM`)

4. **Multi-Tenant Support**
   - Extracts current tenant/directory information from the portal session
   - Enables cross-tenant navigation when clicking bookmarks
   - Location: `src/features/bookmarks/url-parser.ts` (function `getTenantNameFromDOM`)

**Why Restricted to portal.azure.com:**
- Extension has no functionality outside Azure Portal
- Limits security surface area
- Users can verify extension only activates on portal.azure.com

**What We DON'T Do:**
- No modification of portal functionality
- No interception of user actions (clicks, form submissions)
- No reading of sensitive data (passwords, secrets, keys)
- No tracking across other websites

---

## Remote Code Usage

**Question:** Does the extension use remote code (external JS/Wasm, eval, external modules)?

**Answer:** **NO**

**Evidence:**

1. **No External Script Loading**
   - All JavaScript is bundled into the extension package
   - No `<script src="https://...">` tags
   - Build tool (Vite) bundles all dependencies locally

2. **No Dynamic Code Execution**
   - No use of `eval()`
   - No use of `new Function()`
   - No dynamic script insertion
   - Verified via code search: No matches found

3. **No External Module Imports**
   - All dependencies are npm packages bundled at build time
   - Dependencies included in package:
     - `fuzzysort` - fuzzy search (bundled)
     - `deep-diff` - object comparison (bundled)
   - No CDN imports or external module URLs

4. **External URLs Are Documentation Links Only**
   - About modal contains links to:
     - Flaticon.com (icon attribution)
     - GitHub repos (library documentation)
   - These are standard `<a href>` links, not code execution

5. **Azure ARM API Calls**
   - Extension makes HTTPS requests to `https://management.azure.com`
   - This is the official Azure Resource Manager API (Microsoft-owned)
   - Used for snapshot/diff feature (not yet exposed in UI)
   - Requests use authentication token from user's existing portal session
   - These are data API calls, NOT remote code execution

**Verification:**
All source code is available at: https://github.com/RawPatty/BetterPortal
- No obfuscation
- No minification (except standard build optimization)
- Open source for community audit

---

## Summary

| Permission | Usage | Data Flow |
|------------|-------|-----------|
| **Storage** | Save bookmarks, history, settings locally | Device only (no network) |
| **ActiveTab** | Read current page URL for bookmarking | Processed locally |
| **Host (portal.azure.com)** | Inject UI, track navigation, extract names | DOM reading only |
| **Remote Code** | **NOT USED** | All code bundled in package |

---

## Privacy Statement

- ✅ No data collection
- ✅ No external servers
- ✅ No telemetry or analytics
- ✅ All data stored locally
- ✅ Open source code
- ✅ No remote code execution

For privacy policy, see: https://github.com/RawPatty/BetterPortal#privacy
