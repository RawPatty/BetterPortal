# Settings Spec

## Summary

User-configurable preferences for hotkeys, history behavior, display, and data management.

## Tech Stack

- Chrome `storage.local` API
- Svelte component for settings UI
- TypeScript (relaxed)

---

## Interfaces

```typescript
interface Settings {
  // Keyboard
  hotkey: HotkeyConfig;

  // History
  historyEnabled: boolean;
  historyRetentionDays: number;
  historyMaxEntries: number;

  // Display
  theme: 'light' | 'dark';
  defaultStateDepth: 'full' | 'resource';
  showStaleIndicator: boolean;

  // Diff
  diffIgnoredPaths: string[];
  maxSnapshotsPerResource: number;

  // Data
  lastExportedAt: number | null;
}

interface HotkeyConfig {
  key: string;           // e.g., "Space"
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  hotkey: { key: 'Space', ctrl: true, shift: false, alt: false },
  historyEnabled: true,
  historyRetentionDays: 30,
  historyMaxEntries: 500,
  theme: 'light',
  defaultStateDepth: 'full',
  showStaleIndicator: true,
  diffIgnoredPaths: ['etag', 'systemData', 'properties.provisioningState'],
  maxSnapshotsPerResource: 5,
  lastExportedAt: null,
};

interface SettingsStore {
  get(): Promise<Settings>;
  update(partial: Partial<Settings>): Promise<void>;
  reset(): Promise<void>;
}
```

---

## Behaviors

### Access Settings

- Via extension popup (click extension icon)
- Via overlay action bar (gear icon or `?` key)
- Opens settings panel/modal

### Hotkey Configuration

1. User clicks "Change hotkey" button
2. UI shows "Press new shortcut..."
3. Capture next keydown event
4. Validate: must include modifier (Ctrl/Shift/Alt)
5. Check for conflicts with browser/portal shortcuts
6. Save new hotkey
7. Update content script listener

**Reserved shortcuts** (warn user):
- `Ctrl+C`, `Ctrl+V`, `Ctrl+X` (clipboard)
- `Ctrl+F` (find)
- `Ctrl+W`, `Ctrl+T` (browser tabs)

### Theme

- `portal`: Match Azure Fluent UI colors
- `dark`: Dark background, light text
- `light`: Light background, dark text
- Applied via CSS variables on overlay container

### Export/Import

**Export:**
1. User clicks "Export Data"
2. Bundle: `{ bookmarks, history, settings, exportedAt }`
3. Generate JSON
4. Trigger download: `betterportal-export-{date}.json`
5. Update `lastExportedAt`

**Import:**
1. User clicks "Import Data"
2. File picker for `.json`
3. Validate structure
4. Merge strategy:
   - Bookmarks: add new (by resourceId+tenantId), skip duplicates
   - History: add new, skip duplicates
   - Settings: optionally import (checkbox)
5. Show summary: "Added X bookmarks, Y history entries"

### Clear Data

- "Clear History": delete all history entries
- "Clear Bookmarks": delete all bookmarks (confirm dialog)
- "Clear Snapshots": delete all snapshots
- "Reset All": restore defaults, clear all data (confirm dialog)

---

## Settings UI Structure

```
SettingsPanel.svelte
├── HotkeySection.svelte
│   └── HotkeyRecorder.svelte
├── HistorySection.svelte
├── DisplaySection.svelte
├── DiffSection.svelte
├── DataSection.svelte
│   ├── ExportButton.svelte
│   ├── ImportButton.svelte
│   └── ClearDataButtons.svelte
└── Footer.svelte (version, links)
```

---

## Storage Schema

```typescript
// chrome.storage.local keys
{
  'settings': Settings,
  'settings_version': number
}
```

---

## Migration

When `settings_version` changes:
1. Load existing settings
2. Merge with new defaults (preserves user values)
3. Add new fields with defaults
4. Update version number

---

## Test Cases

| Input | Expected |
|-------|----------|
| Change hotkey to `Ctrl+Shift+P` | New hotkey works, old hotkey ignored |
| Set hotkey to `Ctrl+C` | Warning shown, change blocked |
| Set history retention to 7 days | Entries older than 7 days pruned |
| Disable history | No new entries captured |
| Switch theme to dark | Overlay renders with dark theme |
| Export data | JSON file downloaded with all data |
| Import valid JSON | Data merged, summary shown |
| Import invalid JSON | Error message, no data changed |
| Clear history | History empty, bookmarks unchanged |
| Reset all with confirm | All data cleared, settings default |
| Open settings with `?` key | Settings panel opens |
