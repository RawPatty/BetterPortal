// Shared TypeScript interfaces for BetterPortal

// ============ Bookmarks ============
export interface Bookmark {
  id: string;
  url: string;
  tenantId: string | null; // GUID only, null if unavailable - used for cross-tenant navigation
  tenantName: string; // Domain or friendly name - used for grouping/display
  resourceId: string;
  displayName: string;
  alias: string | null;
  stateDepth: 'full' | 'resource';
  createdAt: number;
  lastAccessed: number;
  accessCount: number;
}

export type BookmarkSaveResult =
  | { success: true; bookmark: Bookmark }
  | { success: false; reason: 'limit_reached' }
  | { success: false; reason: 'not_resource_page' };

// ============ History ============
export interface HistoryEntry {
  id: string;
  url: string;
  tenantId: string | null; // GUID only, null if unavailable - used for cross-tenant navigation
  tenantName: string; // Domain or friendly name - used for grouping/display
  resourceId: string;
  displayName: string;
  visitedAt: number;
  visitCount: number;
}

// ============ Settings ============
export interface HotkeyConfig {
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

export interface OverlayKeybinds {
  navDown: HotkeyConfig | null;
  navUp: HotkeyConfig | null;
  search: HotkeyConfig | null;
  add: HotkeyConfig | null;
  delete: HotkeyConfig | null;
  edit: HotkeyConfig | null;
  settings: HotkeyConfig | null;
  yank: HotkeyConfig | null;
  openNewTab: HotkeyConfig | null;
}

export interface Settings {
  hotkey: HotkeyConfig;
  historyEnabled: boolean;
  historyRetentionDays: number;
  historyMaxEntries: number;
  theme: 'light' | 'dark';
  defaultStateDepth: 'full' | 'resource';
  overlayKeybinds: OverlayKeybinds;
  lastExportedAt: number | null;
  bookmarkSyncEnabled: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  hotkey: { key: 'Space', ctrl: true, shift: false, alt: false, meta: false },
  historyEnabled: true,
  historyRetentionDays: 30,
  historyMaxEntries: 20,
  theme: 'dark',
  defaultStateDepth: 'full',
  overlayKeybinds: {
    navDown:  { key: 'j', ctrl: false, shift: false, alt: false, meta: false },
    navUp:    { key: 'k', ctrl: false, shift: false, alt: false, meta: false },
    search:   { key: '/', ctrl: false, shift: false, alt: false, meta: false },
    add:      { key: 'a', ctrl: false, shift: false, alt: false, meta: false },
    delete:   { key: 'd', ctrl: false, shift: false, alt: false, meta: false },
    edit:     { key: 'e', ctrl: false, shift: false, alt: false, meta: false },
    settings: { key: '?', ctrl: false, shift: true, alt: false, meta: false },
    yank:       { key: 'y', ctrl: false, shift: false, alt: false, meta: false },
    openNewTab: { key: 't', ctrl: false, shift: false, alt: false, meta: false },
  },
  lastExportedAt: null,
  bookmarkSyncEnabled: false,
};

// ============ Storage Schema ============
export interface StorageSchema {
  bookmarks: Bookmark[];
  bookmarks_version: number;
  history: HistoryEntry[];
  history_version: number;
  settings: Settings;
  settings_version: number;
  tenantAliases: Record<string, string>; // tenantName domain → user-defined alias
}

// ============ URL Parsing ============
export interface ParsedPortalUrl {
  tenantId: string | null;
  tenantDomain: string | null;
  resourceId: string | null;
  blade: string | null;
  fullUrl: string;
}

// ============ Overlay State ============
export type OverlayMode = 'navigate' | 'search' | 'settings';

export interface OverlayState {
  isOpen: boolean;
  mode: OverlayMode;
  selectedIndex: number;
  searchQuery: string;
  filteredItems: (Bookmark | HistoryEntry)[];
}
