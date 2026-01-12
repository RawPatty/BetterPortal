// Shared constants for BetterPortal

// URL Patterns for Azure Portal
export const PORTAL_URL_PATTERNS = {
  // Match tenant ID in URL path: portal.azure.com/{guid}/
  TENANT_ID: /portal\.azure\.com\/([a-f0-9-]{36})/i,

  // Match tenant domain in hash: #@contoso.com/
  TENANT_DOMAIN: /#@([^/]+)\//,

  // Match resource ID: /resource/subscriptions/.../providers/.../resourceName
  RESOURCE_ID: /\/resource\/([^?#]+)/,

  // Match blade name at end of resource path
  BLADE: /\/resource\/[^/]+\/([^?#/]+)$/,

  // Check if URL is a resource page
  IS_RESOURCE_PAGE: /portal\.azure\.com.*\/resource\//,
};

// Reserved keyboard shortcuts that should not be overwritten
export const RESERVED_SHORTCUTS = [
  { key: 'c', ctrl: true, shift: false, alt: false }, // Copy
  { key: 'v', ctrl: true, shift: false, alt: false }, // Paste
  { key: 'x', ctrl: true, shift: false, alt: false }, // Cut
  { key: 'f', ctrl: true, shift: false, alt: false }, // Find
  { key: 'w', ctrl: true, shift: false, alt: false }, // Close tab
  { key: 't', ctrl: true, shift: false, alt: false }, // New tab
  { key: 'a', ctrl: true, shift: false, alt: false }, // Select all
  { key: 'z', ctrl: true, shift: false, alt: false }, // Undo
  { key: 'y', ctrl: true, shift: false, alt: false }, // Redo
  { key: 's', ctrl: true, shift: false, alt: false }, // Save
];

// ARM API endpoints and versions
export const ARM_API = {
  BASE_URL: 'https://management.azure.com',
  DEFAULT_API_VERSION: '2023-07-01',

  // Common resource type API versions
  API_VERSIONS: {
    'Microsoft.Web/sites': '2023-01-01',
    'Microsoft.Storage/storageAccounts': '2023-01-01',
    'Microsoft.Compute/virtualMachines': '2023-09-01',
    'Microsoft.KeyVault/vaults': '2023-07-01',
    'Microsoft.Sql/servers': '2023-05-01-preview',
    'Microsoft.ContainerRegistry/registries': '2023-07-01',
    'Microsoft.ContainerService/managedClusters': '2023-10-01',
  } as Record<string, string>,

  // IAM role assignments API
  ROLE_ASSIGNMENTS_VERSION: '2022-04-01',
};

// DOM selectors for Azure Portal
export const PORTAL_SELECTORS = {
  // Tenant name display
  TENANT_NAME: '.fxs-avatarmenu-tenant-name, [data-telemetryname="DirectoryMenu"]',

  // Resource name in breadcrumb
  RESOURCE_NAME: '.fxs-blade-title-titleText',
};

// Overlay CSS classes
export const OVERLAY_CLASSES = {
  ROOT: 'bp-overlay',
  OPEN: 'bp-overlay--open',
  SEARCH: 'bp-overlay__search',
  LIST: 'bp-overlay__list',
  ITEM: 'bp-overlay__item',
  ITEM_SELECTED: 'bp-overlay__item--selected',
  ITEM_STALE: 'bp-overlay__item--stale',
  GROUP: 'bp-overlay__group',
  GROUP_HEADER: 'bp-overlay__group-header',
  ACTIONS: 'bp-overlay__actions',
};

// Theme CSS variable prefixes
export const THEME_VARS = {
  BG: '--bp-bg',
  BG_SECONDARY: '--bp-bg-secondary',
  TEXT: '--bp-text',
  TEXT_SECONDARY: '--bp-text-secondary',
  BORDER: '--bp-border',
  ACCENT: '--bp-accent',
  ACCENT_HOVER: '--bp-accent-hover',
  ERROR: '--bp-error',
  SUCCESS: '--bp-success',
  WARNING: '--bp-warning',
};

// History debounce time (ms) before capturing navigation
export const HISTORY_DEBOUNCE_MS = 2000;

// Maximum items before pruning
export const MAX_ITEMS = {
  HISTORY: 500,
  SNAPSHOTS_PER_RESOURCE: 5,
};

// Diff ignored paths (ARM properties that change frequently)
export const DEFAULT_IGNORED_PATHS = [
  'etag',
  'systemData',
  'properties.provisioningState',
  'properties.lastModifiedTimeUtc',
  'properties.createdTimeUtc',
];
