# BetterPortal - Session Context

## Project Status

**Last Updated**: 2026-01-12

### Completed
- PRD written (`PRD.md`)
- 5 spec files created in `specs/`:
  - `overlay.md` - Keyboard overlay UI, Vim-style nav, search
  - `bookmarks.md` - Save/organize/navigate resources
  - `history.md` - Auto-capture browsing history
  - `diff.md` - Before/after snapshot comparison
  - `settings.md` - Config, hotkeys, export/import
- Git repo initialized
- Initial commit created (commit `9fd51c0`)

### Pending
- Push to GitHub (gh CLI installed but PATH issue in Claude's shell)

## To Push to GitHub

Run in your terminal:
```powershell
cd "F:\Programming\RawPatty\BetterPortal"
gh repo create BetterPortal --public --source=. --push
```

Or for private repo:
```powershell
gh repo create BetterPortal --private --source=. --push
```

## Tech Stack Decisions
- **Form Factor**: Chrome browser extension
- **UI Framework**: Svelte
- **Language**: TypeScript (relaxed strictness)
- **Storage**: Chrome local storage + IndexedDB
- **Auth**: Piggyback Azure portal session token

## Key Features (MVP)
1. `Ctrl+Space` overlay with Vim keybindings (j/k/Enter/Esc)
2. Bookmarks with tenant context + one-click directory switching
3. Auto-history capture with promotion to bookmarks
4. Before/after diff for validating infrastructure changes
5. Local storage with JSON export

## Out of Scope (MVP)
- Multi-browser support
- Cloud sync (future paid feature)
- Live polling/advanced monitoring
- Auto-detection of related resources

## Next Steps for Implementation
1. Scaffold Chrome extension (manifest.json, Svelte setup)
2. Implement overlay component (Phase 1)
3. Implement bookmark storage (Phase 1)
4. Add history auto-capture (Phase 2)
5. Build diff feature (Phase 3)
