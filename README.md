# BetterPortal

Fast Azure portal navigation with bookmarks, history, and cross-device sync.

> **Open Source** | Privacy-focused | All data stored locally or synced via your Chrome account

## Features

- **Quick Access Overlay**: Press `Ctrl+Space` to open a command palette-style overlay
- **Bookmarks**: Save Azure resources with one-click navigation and inline rename
- **Bookmark Sync**: Optionally sync bookmarks across devices via your Chrome account (up to 150 bookmarks)
- **History**: Auto-capture visited resources with copy-to-clipboard support
- **Import/Export**: Backup and restore bookmarks as JSON
- **Vim-style Navigation**: `j`/`k` to navigate, `Enter` to select, `/` to search
- **Multi-tenant Support**: Automatic directory switching when navigating
- **Directory Aliases**: Rename tenant directories with friendly names
- **Current Directory Display**: Overlay header shows which Azure directory you're in

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
| `a` | Bookmark current page, or convert selected history item to bookmark |
| `d` | Delete selected bookmark |
| `r` | Rename selected bookmark or directory header |
| `?` | Open settings |

### Bookmarks

- Press `a` on any Azure resource page to save a bookmark
- Bookmarks include the tenant context for automatic directory switching
- Choose between "full" state (includes blade) or "resource only" depth
- Press `r` on a selected bookmark to rename it inline
- **Sync**: Enable bookmark sync in Settings to keep bookmarks in sync across all your Chrome devices (up to 150 bookmarks). When the limit is reached, an error banner is shown in the overlay.
- Bookmarks are grouped by directory; press `r` on a directory header to assign it a friendly alias

### History

- Automatically captures visited Azure resources
- Select a history item and press `a` to promote it to a bookmark
- Click the copy icon on any history item to copy its URL to clipboard
- Configurable retention period (default: 30 days)
- Configurable max history entries (default: 20, range: 1-5000)

### Import/Export

- Click the extension icon to access import/export
- **Export Data**: Download all bookmarks as JSON
- **Import Data**: Upload previously exported bookmarks
- Useful for backup, migration, or sharing bookmarks

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
- Max history entries
- Bookmark sync (enable cross-device sync via Chrome account)
- Bookmark count display

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

## Contributing

Contributions are welcome! Here's how you can help:

### Reporting Issues
- Use GitHub Issues to report bugs or request features
- Include steps to reproduce, expected vs actual behavior
- Screenshots are helpful for UI issues

### Pull Requests
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Write tests for your changes (see `CLAUDE.md` for testing guidelines)
4. Ensure tests pass (`npm test`)
5. Commit with clear messages
6. Push to your fork and submit a PR

### Development Guidelines
- See `CLAUDE.md` for architecture patterns and learnings
- Follow existing code style (TypeScript + Svelte)
- Add tests for bug fixes and new features
- Keep commits focused and atomic

## Roadmap

### Current (v1.x)
- ✅ Local bookmarks and history
- ✅ Multi-tenant support with automatic directory switching
- ✅ Customizable hotkeys
- ✅ Dark/Light themes
- ✅ Export/import bookmarks
- ✅ Inline bookmark rename
- ✅ Directory aliases (rename tenant directories with friendly names)
- ✅ Bookmark sync across devices via Chrome account
- ✅ Current directory display in overlay header
- ✅ Copy-to-clipboard for history items and directory headers
- ✅ Configurable history limit and retention

### Planned
- 🔄 Advanced filtering and tagging
- 🔄 Browser support (Firefox, Edge)

**Note:** The core extension will remain free and open source.

## Privacy

- **No telemetry or analytics** - we don't track you
- **No external servers** - all data stored locally in Chrome storage (or optionally Chrome sync storage, which is managed by Google)
- **No data collection** - bookmarks and settings stay on your machine
- **Bookmark sync is opt-in** - disabled by default; enabling it stores bookmarks in `chrome.storage.sync` (Google's infrastructure)
- **Open source** - audit the code yourself

**Full Privacy Policy:** [PRIVACY.md](PRIVACY.md)

## License

MIT - See [LICENSE](LICENSE) file for details
