# BetterPortal

Fast Azure portal navigation with bookmarks, history, and resource diffing.

## Features

- **Quick Access Overlay**: Press `Ctrl+Space` to open a command palette-style overlay
- **Bookmarks**: Save Azure resources with one-click navigation
- **History**: Auto-capture visited resources with promotion to bookmarks
- **Diff**: Snapshot resource state and compare before/after changes
- **Vim-style Navigation**: `j`/`k` to navigate, `Enter` to select, `/` to search
- **Multi-tenant Support**: Automatic directory switching when navigating

## Installation

### Development

```bash
# Install dependencies
npm install

# Build for development
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

### Load in Chrome

1. Run `npm run build` to create the `dist/` folder
2. Open Chrome and navigate to `chrome://extensions`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked" and select the `dist/` folder
5. Navigate to `portal.azure.com` and press `Ctrl+Space`

## Usage

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+Space` | Open/close overlay (customizable) |
| `j` / `k` | Navigate down/up |
| `Enter` | Open selected item |
| `/` | Focus search |
| `Esc` | Close overlay |
| `a` | Add current page as bookmark |
| `d` | Delete selected bookmark |
| `s` | Capture snapshot (on resource page) |
| `d` | Show diff (when snapshots exist) |
| `?` | Open settings |

### Bookmarks

- Press `a` on any Azure resource page to save a bookmark
- Bookmarks include the tenant context for automatic directory switching
- Choose between "full" state (includes blade) or "resource only" depth

### History

- Automatically captures visited Azure resources
- Promote history items to bookmarks with `a` key
- Configurable retention period (default: 30 days)

### Diff Feature

1. Navigate to a resource you want to track
2. Press `s` to capture a "before" snapshot
3. Make your infrastructure changes
4. Press `s` again for an "after" snapshot
5. Press `d` to view the diff

The diff shows:
- Property changes (added, removed, modified)
- IAM role assignment changes

## Tech Stack

- **UI**: Svelte 4
- **Build**: Vite + CRXJS
- **Language**: TypeScript
- **Testing**: Vitest + Testing Library
- **Extension**: Chrome Manifest V3

## Project Structure

```
src/
├── background/          # Service worker
├── content/             # Content script (overlay injection)
├── features/
│   ├── overlay/         # Main overlay UI
│   ├── bookmarks/       # Bookmark management
│   ├── history/         # History tracking
│   ├── diff/            # Snapshot & diff
│   └── settings/        # Settings management
├── popup/               # Extension popup
├── shared/              # Shared types, storage, constants
└── styles/              # Global styles
```

## Configuration

Settings are accessible via:
- Extension popup (click extension icon)
- Overlay settings (`?` key)

Configurable options:
- Hotkey customization
- Theme (Light, Dark)
- History enable/disable
- History retention period
- Diff ignored paths

## Development

### Adding Tests

Tests are co-located with source files:

```bash
src/features/bookmarks/url-parser.ts
src/features/bookmarks/url-parser.test.ts
```

Run tests:
```bash
npm test           # Watch mode
npm run test:watch # Explicit watch mode
```

### Building

```bash
npm run build
```

Output is in `dist/` folder, ready for Chrome extension loading.

## License

MIT
