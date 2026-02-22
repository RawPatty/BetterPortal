# BetterPortal - Session Context

## Project Status

**Last Updated**: 2026-01-12
**Status**: MVP Implementation Complete

### Completed
- All 24 implementation tasks from the plan
- 31 unit tests passing
- Production build working

### Project Structure
```
src/
├── background/index.ts           # Service worker
├── content/
│   ├── index.ts                  # Content script entry
│   └── mount.ts                  # Svelte mount
├── features/
│   ├── overlay/
│   │   ├── Overlay.svelte        # Main overlay UI
│   │   └── overlay.store.ts      # Overlay state
│   ├── bookmarks/
│   │   ├── bookmarks.store.ts    # Bookmark CRUD
│   │   ├── url-parser.ts         # URL parsing utilities
│   │   └── url-parser.test.ts    # Tests
│   ├── history/
│   │   ├── history.store.ts      # History management
│   │   └── history.observer.ts   # Navigation tracking
│   ├── diff/
│   │   ├── token-extractor.ts    # ARM token capture
│   │   ├── arm-client.ts         # ARM API client
│   │   ├── snapshot.store.ts     # Snapshot management
│   │   ├── diff-calculator.ts    # Diff logic
│   │   ├── diff-calculator.test.ts
│   │   └── DiffModal.svelte      # Diff UI
│   └── settings/
│       ├── settings.store.ts     # Settings management
│       └── SettingsPanel.svelte  # Settings UI
├── popup/
│   ├── index.html
│   ├── main.ts
│   └── Popup.svelte              # Extension popup
├── shared/
│   ├── types.ts                  # TypeScript interfaces
│   ├── storage.ts                # Chrome storage wrapper
│   └── constants.ts              # Shared constants
└── styles/
    └── overlay.css               # Global styles
```

## Tech Stack
- **Form Factor**: Chrome browser extension (Manifest V3)
- **UI Framework**: Svelte 4
- **Language**: TypeScript (relaxed strictness)
- **Build**: Vite + CRXJS
- **Testing**: Vitest + Testing Library
- **Storage**: Chrome local storage

## Key Features (MVP)
1. `Ctrl+Space` overlay with Vim keybindings
2. Bookmarks with tenant context + one-click switching
3. Auto-history capture with promotion to bookmarks
4. Before/after diff for validating infrastructure changes
5. Local storage with JSON export
6. Theming (Portal, Dark, Light)

## Commands
```bash
npm install       # Install dependencies
npm run dev       # Development mode
npm run build     # Production build
npm test          # Run tests
```

## Loading in Chrome
1. Run `npm run build`
2. Go to `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked" and select `dist/`
5. Navigate to portal.azure.com
6. Press `Ctrl+Space`

## Future Enhancements
- Cloud sync (implemented via chrome.storage.sync)
- Multi-browser support
- Related resource detection
- Advanced organization (folders, tags)
