# Privacy Policy for BetterPortal

**Last Updated: January 18, 2025**

## Introduction

BetterPortal ("the Extension") is committed to protecting your privacy. This privacy policy explains what data we collect, how we use it, and your rights regarding your data.

## Data Collection

### What We Collect

BetterPortal collects and stores the following data **locally on your device only**:

#### 1. Web History (portal.azure.com only)
- **What:** URLs of Azure Portal resources you visit
- **Why:** To provide navigation history and quick access to recently visited resources
- **Where Stored:** Local Chrome storage (`chrome.storage.local`) on your device
- **Retention:** Configurable in settings (default: 30 days)
- **User Control:** Can be disabled entirely in extension settings

**Details:**
- Resource URLs (e.g., `https://portal.azure.com/#@tenant/resource/...`)
- Resource display names
- Visit timestamps
- Visit counts
- Tenant/directory names

#### 2. Website Content (portal.azure.com only)
- **What:** Resource names and tenant names extracted from Azure Portal DOM
- **Why:** Azure Portal URLs contain GUIDs instead of human-readable names. We extract the friendly names shown in the portal to display in bookmarks.
- **Where Stored:** Local Chrome storage as part of bookmarks and history
- **Examples:**
  - URL contains: `12345-abcd-...` (GUID)
  - DOM shows: "MyProductionApp" (friendly name)
  - We store: "MyProductionApp"

**What We DON'T Access:**
- Passwords or credentials
- Azure resource configurations or secrets
- API keys or connection strings
- Any data from resources themselves

#### 3. Bookmarks
- **What:** User-created bookmarks to Azure resources
- **Why:** Core feature - save and organize your frequently used resources
- **Where Stored:** Local Chrome storage on your device
- **User Control:** Full control - add, edit, delete, export, import

**Details:**
- Bookmark URL
- Display name
- Tenant information
- Timestamps
- User-defined aliases (optional)

#### 4. Settings and Preferences
- **What:** Extension configuration
- **Where Stored:** Local Chrome storage on your device

**Details:**
- Keyboard shortcut preferences
- Theme selection (Light/Dark)
- History retention period
- Default bookmark depth (full/resource-only)
- Auto-bookmark preferences

### What We DON'T Collect

- ❌ Personally identifiable information (name, email, address)
- ❌ Health information
- ❌ Financial or payment information
- ❌ Authentication credentials (passwords, API keys)
- ❌ Personal communications
- ❌ Location data (GPS, IP address)
- ❌ General web browsing history (only portal.azure.com)
- ❌ User activity outside portal.azure.com (no click tracking, keystroke logging)
- ❌ Azure resource content (configurations, data, secrets)

## How We Use Your Data

All data is used **exclusively for the extension's functionality**:

1. **Bookmarks** - Store and display your saved Azure resources
2. **History** - Show recently visited resources for quick access
3. **Settings** - Remember your preferences
4. **Resource Names** - Display human-readable names instead of GUIDs

## Data Storage and Security

### Local Storage Only
- **ALL data is stored locally** on your device using Chrome's `chrome.storage.local` API
- **ZERO data is transmitted** to external servers
- **NO cloud storage** or remote databases
- **NO analytics or telemetry**

### Data Security
- Data is stored in Chrome's secure storage API
- Only this extension can access the stored data
- Data persists only on your device
- Uninstalling the extension removes all stored data

## Data Sharing

**We do NOT share, sell, or transmit your data to anyone.**

- No third-party services
- No analytics providers
- No advertising networks
- No external APIs (except Azure's own management.azure.com for future diff feature)
- No remote logging

## Your Rights and Control

### You Have Complete Control:

1. **View Your Data**
   - Click extension icon → Export Data
   - Downloads all bookmarks as JSON

2. **Delete Your Data**
   - Individual: Delete bookmarks/history items one by one
   - Bulk: Settings → Reset to Defaults (clears all data)
   - Complete: Uninstall extension (removes all data)

3. **Control Collection**
   - Settings → Disable history tracking
   - Settings → Adjust retention period
   - Don't bookmark pages you don't want saved

4. **Export Your Data**
   - Extension popup → Export Data
   - Saves all bookmarks as JSON file
   - Use for backup or migration

5. **Import Your Data**
   - Extension popup → Import Data
   - Upload previously exported JSON file

## Extension Permissions Explanation

### Why We Need These Permissions:

#### Storage
- Store bookmarks, history, and settings locally on your device
- Required for core functionality

#### ActiveTab
- Read current tab URL when you bookmark a page
- Only accesses URL when you press the bookmark hotkey
- Does not track your browsing

#### Host Permission (portal.azure.com)
- Inject overlay UI for bookmark navigation
- Monitor navigation within Azure Portal (single-page app)
- Extract friendly resource names from portal DOM
- **Limited to portal.azure.com only** - does not work on other websites

## Children's Privacy

BetterPortal is not directed at children under 13. We do not knowingly collect information from children.

## Changes to Privacy Policy

We may update this privacy policy as the extension evolves. Changes will be:
- Posted to this document
- Version-dated at the top
- Announced in release notes (if significant)

**How to stay informed:**
- Check this document: https://github.com/RawPatty/BetterPortal/blob/trunk/PRIVACY.md
- Review release notes when updating

## Open Source Transparency

BetterPortal is **fully open source**:
- **Source Code:** https://github.com/RawPatty/BetterPortal
- **No obfuscation** - all code is readable
- **Community audit** - anyone can review the code
- **Verify our claims** - check the code yourself

## Contact

For privacy questions or concerns:
- **GitHub Issues:** https://github.com/RawPatty/BetterPortal/issues
- **Email:** [Create an issue on GitHub]

## Compliance

This extension complies with:
- Chrome Web Store Privacy Policies
- General Data Protection Regulation (GDPR) principles
- California Consumer Privacy Act (CCPA) principles

## Your Consent

By using BetterPortal, you consent to this privacy policy.

If you do not agree, please do not use the extension.

---

## Summary (TL;DR)

✅ **All data stored locally** on your device
✅ **Zero data transmitted** to external servers
✅ **No tracking, analytics, or telemetry**
✅ **You have full control** - export, delete, disable anytime
✅ **Open source** - verify for yourself
✅ **Only works on portal.azure.com** - doesn't touch other sites

**We respect your privacy. Your data never leaves your device.**
