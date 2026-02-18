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
  isStale: boolean;
}

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

export interface Settings {
  hotkey: HotkeyConfig;
  historyEnabled: boolean;
  historyRetentionDays: number;
  historyMaxEntries: number;
  autoBookmark: boolean;
  theme: 'light' | 'dark';
  defaultStateDepth: 'full' | 'resource';
  showStaleIndicator: boolean;
  lastExportedAt: number | null;
}

export const DEFAULT_SETTINGS: Settings = {
  hotkey: { key: 'Space', ctrl: true, shift: false, alt: false, meta: false },
  historyEnabled: true,
  historyRetentionDays: 30,
  historyMaxEntries: 20,
  autoBookmark: false, // Disabled - pages go to history first, user explicitly bookmarks
  theme: 'light',
  defaultStateDepth: 'full',
  showStaleIndicator: true,
  lastExportedAt: null,
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
