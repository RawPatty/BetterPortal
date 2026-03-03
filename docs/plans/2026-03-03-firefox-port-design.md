# Firefox Port Design

**Date:** 2026-03-03
**Status:** Approved

## Goal

Port BetterPortal to Firefox while maintaining a single codebase that produces both Chrome and Firefox builds.

## Approach

Replace `@crxjs/vite-plugin` with `@samrum/vite-plugin-web-extension`, which supports Chrome and Firefox from a single Vite config. Distribution via Mozilla Add-ons (AMO).

## Section 1: Build System

Swap `@crxjs/vite-plugin` for `@samrum/vite-plugin-web-extension`. The API is nearly identical — both take a manifest as input and auto-wire content scripts, background, and popup entries.

`vite.config.ts` reads a `TARGET` env var (`chrome` | `firefox`) and selects the appropriate manifest file.

Build commands:
```
npm run build            → Chrome (dist/)        ← keeps existing behavior
npm run build:chrome     → Chrome (dist/)
npm run build:firefox    → Firefox (dist-firefox/)
```

Chrome output continues to `dist/` so the existing "load unpacked" workflow is unchanged.

## Section 2: Manifests

`src/manifest.json` → renamed to `src/manifest.chrome.json` (content unchanged).
New `src/manifest.firefox.json` created with these additions:

- `browser_specific_settings.gecko.id`: `"betterportal@rawpatty.com"` — required by AMO
- `browser_specific_settings.gecko.strict_min_version`: `"128.0"` — minimum version that supports `"world": "MAIN"` for content scripts (June 2024)

Everything else is identical: MV3, same permissions (`storage`, `activeTab`), same host permissions (`*://portal.azure.com/*`), same content scripts (including MAIN world `page-context.ts`), same service worker background.

Version numbers stay in sync across `package.json`, `manifest.chrome.json`, and `manifest.firefox.json`.

## Section 3: Code Changes

Minimal. Firefox has supported the `chrome.*` namespace since Firefox 55. All 24 API calls have direct equivalents:

| API | Firefox support |
|-----|----------------|
| `chrome.storage.local/sync` | ✓ Full support |
| `chrome.runtime.*` | ✓ Full support |
| `chrome.tabs.*` | ✓ Full support |
| `chrome.action.*` | ✓ MV3 (FF 109+) |
| `navigator.clipboard` | ✓ |
| `sessionStorage` / MSAL scan | ✓ (shared with page) |

**One addition:** `src/shared/browser.ts` — exposes `isFirefox()` for the sync storage UI note (documenting the Firefox account requirement for `chrome.storage.sync`).

**`page-context.ts` (MAIN world script)** is the highest-risk piece — it requires FF 128+ and needs explicit manual testing. The implementation itself is pure DOM + `window.fetch` monkey-patching with no Chrome APIs.

## Section 4: Distribution & Packaging

`web-ext` CLI added as a dev dependency for packaging and linting.

New scripts:
```
npm run package:firefox   → web-ext build on dist-firefox/, produces .xpi
npm run lint:firefox      → web-ext lint for AMO compliance
```

**AMO note:** Mozilla requires source code submission alongside minified builds. Submit the repo source zip with each `.xpi` upload.

**Dev workflow:** `web-ext run --source-dir dist-firefox/` for auto-reloading in Firefox during development.

## Section 5: Testing

Existing unit tests require no changes — they mock `chrome.*` and are browser-agnostic.

Manual testing checklist for Firefox:

1. **`page-context.ts` MAIN world** — verify `window.fetch` interception fires and writes `data-betterportal-current-tenant` to `<html>` on OAuth token request
2. **Overlay injection** — `Ctrl+Space` opens overlay and UI renders correctly
3. **Cross-tenant navigation** — GUID injected into URL path for cross-tenant bookmarks
4. **Sync storage** — bookmarks persist across restart with Firefox account sign-in
5. **Import/export** — JSON export/import works (`FileReader` + `Blob` + `URL.createObjectURL`)
6. **Popup** — extension icon popup opens, settings page link works

## Out of Scope

- No new automated tests for Firefox-specific behaviour (covered by manual checklist)
- No changes to existing Chrome release process
