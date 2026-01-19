# BetterPortal

Fast Azure portal navigation with bookmarks, and history.

> **Open Source** | Privacy-focused | All data stored locally

## Features

- **Quick Access Overlay**: Press `Ctrl+Space` to open a command palette-style overlay
- **Bookmarks**: Save Azure resources with one-click navigation
- **History**: Auto-capture visited resources
- **Import/Export**: Backup and restore bookmarks as JSON
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
| `?` | Open settings |

### Bookmarks

- Press `a` on any Azure resource page to save a bookmark
- Bookmarks include the tenant context for automatic directory switching
- Choose between "full" state (includes blade) or "resource only" depth

### History

- Automatically captures visited Azure resources
- Navigate to any resource and press `a` to bookmark it
- Configurable retention period (default: 30 days)

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
│   ├── diff/            # Snapshot & diff (coming soon)
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
- ✅ Multi-tenant support
- ✅ Customizable hotkeys
- ✅ Dark/Light themes
- ✅ Export/import bookmarks

### Planned
- 🔄 Resource diffing and snapshots
- 🔄 Direct promotion of selected history items to bookmarks
- 🔄 Cloud sync for bookmarks (paid feature)
- 🔄 Team collaboration features
- 🔄 Advanced filtering and tagging
- 🔄 Browser sync (Firefox, Edge)

**Note:** The core extension will remain free and open source. Cloud sync and team features will be offered as optional paid services to support development.

## Privacy

- **No telemetry or analytics** - we don't track you
- **No external servers** - all data stored locally in Chrome storage
- **No data collection** - bookmarks and settings stay on your machine
- **Open source** - audit the code yourself

**Full Privacy Policy:** [PRIVACY.md](PRIVACY.md)

## License

MIT - See [LICENSE](LICENSE) file for details
