# Firefox Port Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Firefox support while keeping Chrome working, producing separate `dist/` (Chrome) and `dist-firefox/` (Firefox) build outputs from one codebase.

**Architecture:** Replace the Chrome-only `@crxjs/vite-plugin` with `@samrum/vite-plugin-web-extension`, which supports both targets from a single Vite config driven by a `TARGET` env var. Two manifest files (`manifest.chrome.json`, `manifest.firefox.json`) diverge only on gecko-specific fields. All `chrome.*` API calls work unchanged in Firefox.

**Tech Stack:** Vite 5, `@samrum/vite-plugin-web-extension`, `web-ext` (Mozilla CLI for packaging/linting), Svelte 4, TypeScript, Vitest.

---

### Task 1: Install/uninstall packages

**Files:**
- Modify: `package.json`

**Step 1: Remove CRXJS, install replacement + web-ext**

```bash
npm uninstall @crxjs/vite-plugin
npm install --save-dev @samrum/vite-plugin-web-extension web-ext
```

**Step 2: Verify install succeeded**

```bash
npm ls @samrum/vite-plugin-web-extension web-ext
```

Expected: both packages listed with version numbers, no errors.

**Step 3: Verify tests still pass (baseline before any code changes)**

```bash
npm test -- --run
```

Expected: all tests pass. If any fail now, fix before proceeding.

**Step 4: Commit**

```bash
git -c core.autocrlf=false add package.json package-lock.json
git commit -m "build: replace crxjs with vite-plugin-web-extension, add web-ext"
```

---

### Task 2: Create manifest files

**Files:**
- Rename: `src/manifest.json` → `src/manifest.chrome.json` (content unchanged)
- Create: `src/manifest.firefox.json`

**Step 1: Rename the existing manifest**

```bash
git mv src/manifest.json src/manifest.chrome.json
```

**Step 2: Create `src/manifest.firefox.json`**

This is identical to `manifest.chrome.json` with one addition: `browser_specific_settings`. Copy the chrome manifest content exactly, then add the gecko block:

```json
{
  "manifest_version": 3,
  "name": "BetterPortal",
  "description": "Bookmark Azure Portal resources for instant revisits. Keyboard-driven overlay with history, cross-tenant navigation, and search.",
  "version": "1.0.97",
  "browser_specific_settings": {
    "gecko": {
      "id": "betterportal@rawpatty.com",
      "strict_min_version": "128.0"
    }
  },
  "icons": {
    "16": "src/icons/icon16.png",
    "48": "src/icons/icon48.png",
    "128": "src/icons/icon128.png"
  },
  "permissions": [
    "storage",
    "activeTab"
  ],
  "host_permissions": [
    "*://portal.azure.com/*"
  ],
  "background": {
    "service_worker": "src/background/index.ts",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["*://portal.azure.com/*"],
      "js": ["src/content/index.ts"],
      "run_at": "document_idle"
    },
    {
      "matches": ["*://portal.azure.com/*"],
      "js": ["src/content/page-context.ts"],
      "run_at": "document_idle",
      "world": "MAIN"
    }
  ],
  "action": {
    "default_popup": "src/popup/index.html",
    "default_icon": {
      "16": "src/icons/icon16.png",
      "48": "src/icons/icon48.png"
    }
  }
}
```

**Step 3: Commit**

```bash
git -c core.autocrlf=false add src/manifest.chrome.json src/manifest.firefox.json
git commit -m "build: split manifest into chrome/firefox variants"
```

---

### Task 3: Update vite.config.ts for dual-target builds

**Files:**
- Modify: `vite.config.ts`

**Step 1: Replace the entire content of `vite.config.ts`**

The key changes:
- Remove `crx` import, add `webExtension` import
- Read `TARGET` env var to select manifest and output dir
- Remove `popup` from explicit `rollupOptions.input` — the plugin auto-detects it from the manifest
- Keep `settings` as explicit input — it's not in the manifest but is opened via `chrome.runtime.getURL`
- Update `copy-license` plugin to use the dynamic `outDir`

```typescript
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import webExtension from '@samrum/vite-plugin-web-extension';
import { readFileSync, copyFileSync } from 'fs';

const target = process.env.TARGET || 'chrome';
const outDir = target === 'firefox' ? 'dist-firefox' : 'dist';
const manifestPath =
  target === 'firefox' ? './src/manifest.firefox.json' : './src/manifest.chrome.json';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

export default defineConfig({
  plugins: [
    svelte(),
    webExtension({ manifest }),
    {
      name: 'copy-license',
      closeBundle() {
        try {
          copyFileSync('LICENSE', `${outDir}/LICENSE`);
        } catch (err) {
          console.warn('Could not copy LICENSE:', err);
        }
      },
    },
  ],
  build: {
    outDir,
    rollupOptions: {
      input: {
        settings: 'src/settings/index.html',
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
```

**Step 2: Run a Chrome build to verify nothing broke**

```bash
npm run build
```

Expected: `dist/` folder produced, no build errors. Check that `dist/manifest.json`, `dist/src/popup/index.html`, and `dist/src/settings/index.html` all exist.

If the build fails with a missing entry point error for popup, add it back to `rollupOptions.input`:
```typescript
input: {
  popup: 'src/popup/index.html',
  settings: 'src/settings/index.html',
},
```

**Step 3: Run tests to confirm no regressions**

```bash
npm test -- --run
```

Expected: all tests pass.

**Step 4: Commit**

```bash
git -c core.autocrlf=false add vite.config.ts
git commit -m "build: update vite config for dual chrome/firefox targets"
```

---

### Task 4: Add package.json scripts

**Files:**
- Modify: `package.json`

**Step 1: Update the `scripts` section**

Replace the existing `scripts` block with:

```json
"scripts": {
  "dev": "vite",
  "build": "TARGET=chrome vite build",
  "build:chrome": "TARGET=chrome vite build",
  "build:firefox": "TARGET=firefox vite build",
  "package:firefox": "web-ext build --source-dir dist-firefox --artifacts-dir web-ext-artifacts",
  "lint:firefox": "web-ext lint --source-dir dist-firefox",
  "preview": "vite preview",
  "test": "vitest",
  "test:watch": "vitest --watch",
  "test:run": "vitest --run",
  "test:coverage": "vitest --coverage"
},
```

**Note for Windows:** On Windows, `TARGET=chrome` env var syntax doesn't work in cmd.exe but does work in bash (which this project uses per CLAUDE.md). If running from a non-bash shell, use `cross-env`: `npx cross-env TARGET=chrome vite build`. The bash shell is assumed here.

**Step 2: Verify `build:firefox` produces a Firefox build**

```bash
npm run build:firefox
```

Expected: `dist-firefox/` folder created with `dist-firefox/manifest.json` that contains the `browser_specific_settings.gecko` block. Verify:

```bash
grep -l "gecko" dist-firefox/manifest.json
```

Expected: `dist-firefox/manifest.json` (file found).

**Step 3: Commit**

```bash
git -c core.autocrlf=false add package.json
git commit -m "build: add build:firefox, package:firefox, lint:firefox scripts"
```

---

### Task 5: Add browser detection utility

**Files:**
- Create: `src/shared/browser.ts`
- Modify: `src/features/settings/SettingsPanel.svelte` (lines 262-270)

**Step 1: Create `src/shared/browser.ts`**

```typescript
export function isFirefox(): boolean {
  return navigator.userAgent.includes('Firefox');
}
```

**Step 2: Add Firefox sync note to SettingsPanel.svelte**

In `SettingsPanel.svelte`, import `isFirefox` at the top of the `<script>` block (after the existing imports):

```typescript
import { isFirefox } from '../../shared/browser';
```

Then, find the `{#if bookmarkSyncError}` block (around line 268) and add a Firefox note directly after the closing `{/if}` of that block but before the closing `</section>`:

```svelte
          {#if bookmarkSyncError}
            <div class="bp-error">{bookmarkSyncError}</div>
          {/if}
          {#if isFirefox()}
            <div class="bp-sync-note">Firefox: requires a Firefox account for sync to work across devices.</div>
          {/if}
        </section>
```

Also add the CSS for `.bp-sync-note` near the existing `.bp-sync-status` style (around line 496):

```css
  .bp-sync-note {
    font-size: 11px;
    color: var(--bp-text-secondary, #666);
    margin-top: 4px;
  }
```

**Step 3: Run tests**

```bash
npm test -- --run
```

Expected: all tests pass.

**Step 4: Commit**

```bash
git -c core.autocrlf=false add src/shared/browser.ts src/features/settings/SettingsPanel.svelte
git commit -m "feat: add Firefox browser detection and sync account note in settings"
```

---

### Task 6: Update release documentation

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

**Step 1: Update README.md — Installation section**

Find the "### Development" build section and update to document both targets:

```markdown
### Development

\`\`\`bash
# Install dependencies
npm install

# Build for Chrome (default)
npm run build

# Build for Firefox
npm run build:firefox

# Build both
npm run build && npm run build:firefox

# Run tests
npm test
\`\`\`

### Load in Chrome

1. Run `npm run build` to create the `dist/` folder
2. Open Chrome → `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `dist/` folder

### Load in Firefox

1. Run `npm run build:firefox` to create the `dist-firefox/` folder
2. Open Firefox → `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on"
4. Select any file inside the `dist-firefox/` folder
5. Minimum Firefox version: **128** (June 2024)
```

**Step 2: Update README.md — Release Process section (or add one if missing)**

Add to the existing release notes or create a new subsection under Development:

```markdown
### Firefox Release (AMO)

\`\`\`bash
npm run build:firefox          # build the extension
npm run lint:firefox           # check AMO compliance
npm run package:firefox        # create .xpi in web-ext-artifacts/
\`\`\`

Submit the `.xpi` to [addons.mozilla.org](https://addons.mozilla.org).
Mozilla requires a source code zip alongside minified builds — attach the repo source zip to the submission.
```

**Step 3: Update CLAUDE.md — Release Process table**

Find the "## Release Process" section and add a row or note about Firefox:

```markdown
## Release Process

When making updates:
- **Bump the version** in `src/manifest.chrome.json`, `src/manifest.firefox.json`, and `package.json` (keep all three in sync)
- **Push to GitHub** after committing changes
- **Firefox release**: run `npm run build:firefox && npm run package:firefox`, submit `.xpi` to AMO
```

**Step 4: Commit**

```bash
git -c core.autocrlf=false add README.md CLAUDE.md
git commit -m "docs: update README and CLAUDE.md for Firefox build and release process"
```

---

### Task 7: Update version bump instructions in memory

**Files:**
- Modify: `C:\Users\johns\.claude\projects\F--Programming-RawPatty-BetterPortal\memory\MEMORY.md`

**Step 1: Update the version bump reminder**

Find this line in MEMORY.md:
```
- **Always bump version** in both `src/manifest.json` and `package.json` (keep them in sync) when committing features or fixes
```

Replace with:
```
- **Always bump version** in `src/manifest.chrome.json`, `src/manifest.firefox.json`, and `package.json` (keep all three in sync) when committing features or fixes
```

No commit needed — MEMORY.md is not tracked in the repo.

---

### Task 8: Final verification

**Step 1: Run all tests**

```bash
npm test -- --run
```

Expected: all tests pass.

**Step 2: Verify Chrome build**

```bash
npm run build
ls dist/manifest.json
```

Expected: `dist/manifest.json` exists. Check that it does NOT contain `browser_specific_settings` (Chrome manifest).

**Step 3: Verify Firefox build**

```bash
npm run build:firefox
grep "gecko" dist-firefox/manifest.json
```

Expected: output contains `"gecko"`.

**Step 4: Lint Firefox build**

```bash
npm run lint:firefox
```

Expected: no errors (warnings about self-hosted permissions are OK to ignore). If AMO compliance errors appear, fix them before the final commit.

**Step 5: Final commit if any lint fixes were needed**

```bash
git -c core.autocrlf=false add -A
git commit -m "fix: address web-ext lint warnings for AMO compliance"
```

---

## Manual Testing Checklist (do in Firefox after loading dist-firefox/)

Load `dist-firefox/` as a temporary add-on in Firefox (`about:debugging`), then navigate to `portal.azure.com` and verify:

1. **MAIN world script** — open DevTools console on portal.azure.com, sign in, and check: `document.documentElement.getAttribute('data-betterportal-current-tenant')` should return a GUID after the first token refresh
2. **Overlay** — `Ctrl+Space` opens the overlay, UI renders correctly
3. **Cross-tenant navigation** — bookmark a resource in one tenant, switch tenant, navigate to bookmark — verify URL has the GUID injected in path
4. **Sync storage** — enable sync in settings (requires Firefox account), reload, confirm bookmarks persist
5. **Import/export** — export bookmarks as JSON, delete all, re-import, confirm they return
6. **Popup** — click extension icon, confirm popup opens and settings link works
