# Chrome Web Store Submission Guide

## Required Assets

### 1. Extension Icons (PNG format)
You need to create PNG versions of the icons from the SVG files in `src/icons/`:

**Required sizes:**
- `icon16.png` - 16x16 pixels (toolbar icon)
- `icon48.png` - 48x48 pixels (extensions management page)
- `icon128.png` - 128x128 pixels (Chrome Web Store, installation dialog)

**How to create:**

**Option A: Online converter (easiest)**
1. Go to https://svgtopng.com or https://cloudconvert.com/svg-to-png
2. Upload each SVG file from `src/icons/`
3. Set the output dimensions (16x16, 48x48, 128x128)
4. Download and save to `src/icons/` folder

**Option B: Using Inkscape (if installed)**
```bash
inkscape icon16.svg --export-type=png --export-width=16 --export-height=16 --export-filename=icon16.png
inkscape icon48.svg --export-type=png --export-width=48 --export-height=48 --export-filename=icon48.png
inkscape icon128.svg --export-type=png --export-width=128 --export-height=128 --export-filename=icon128.png
```

**Option C: Using Chrome browser**
1. Open each SVG in Chrome
2. Right-click > Inspect
3. Take screenshot at exact pixel dimensions
4. Crop and save as PNG

### 2. Store Listing Assets

Create these for the Chrome Web Store dashboard:

#### Screenshots (required - at least 1, up to 5)
- **Size:** 1280x800 or 640x400 pixels
- **Format:** PNG or JPEG
- **Content:** Show your extension in action
  - Overlay with bookmarks
  - Settings panel
  - Navigation features
  - Before/After comparison

#### Small Promotional Tile (optional but recommended)
- **Size:** 440x280 pixels
- **Format:** PNG or JPEG
- **Content:** Extension icon + name + tagline

#### Marquee Promotional Tile (optional - featured placement)
- **Size:** 1400x560 pixels
- **Format:** PNG or JPEG

## Extension Package

### Build for production:
```bash
npm run build
```

### Create ZIP file:
1. Navigate to `dist/` folder
2. Select all files and folders
3. Right-click > Send to > Compressed (zipped) folder
4. Name it: `betterportal-1.0.59.zip`

**Important:** Do NOT zip the dist folder itself - zip the contents inside dist/

## Submission Checklist

- [ ] PNG icons created (16, 48, 128)
- [ ] Extension builds without errors
- [ ] Extension tested in Chrome
- [ ] ZIP file created from dist/ contents
- [ ] At least 1 screenshot prepared (1280x800)
- [ ] Store listing description written
- [ ] Privacy policy URL (if collecting user data)
- [ ] Promotional tile (440x280) created

## Store Listing Text

### Short Description (132 chars max)
Fast Azure Portal navigation with bookmarks, history, and resource diffing. Ctrl+Space to access anywhere.

### Detailed Description
BetterPortal enhances Azure Portal productivity with instant navigation:

**Features:**
- Fast bookmark management with fuzzy search
- Automatic history tracking
- Cross-tenant navigation support
- Resource state snapshots and diffing
- Customizable keyboard shortcuts
- Light and dark themes
- Export/import bookmarks

**Hotkey:** Press Ctrl+Space (customizable) on portal.azure.com to open the quick navigation overlay.

**Permissions:**
- Storage: Save bookmarks and settings locally
- ActiveTab: Access current tab URL for bookmarking

Open source and privacy-focused - all data stays local.

### Category
Productivity

### Language
English

## After Submission

The review process typically takes a few days. You'll receive email updates about:
1. Submission received
2. In review
3. Published (or rejection with reasons)

## Update Process

For future updates:
1. Bump version in `package.json` and `manifest.json`
2. Build and test
3. Create new ZIP
4. Upload to Chrome Web Store dashboard
5. Update "What's new" section
