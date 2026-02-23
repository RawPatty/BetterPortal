// Shared constants for BetterPortal

// URL Patterns for Azure Portal
export const PORTAL_URL_PATTERNS = {
  // Match tenant ID in URL path: portal.azure.com/{guid}/
  TENANT_ID: /portal\.azure\.com\/([a-f0-9-]{36})/i,

  // Match tenant domain in hash: #@contoso.com/ or #@contoso.com (without trailing slash)
  TENANT_DOMAIN: /#@([^/#]+)/,

  // Match resource ID: /resource/subscriptions/.../providers/.../resourceName
  RESOURCE_ID: /\/resource\/([^?#]+)/,

  // Match resource ID from blade URL: resourceId%2Fsubscriptions%2F...
  BLADE_RESOURCE_ID: /resourceId[=%2F]+([^&]+)/i,

  // Match subscription ID directly from hash: #@tenant/subscriptions/{guid} or subscriptionId={guid}
  SUBSCRIPTION_ID: /(?:\/subscriptions\/|subscriptionId[=%])([a-f0-9-]{36})/i,

  // Match blade name at end of resource path
  BLADE: /\/resource\/[^/]+\/([^?#/]+)$/,

  // Check if URL is a resource page (multiple patterns for different portal views)
  // Matches: /resource/, resourceId=, /subscriptions/, blade URLs, view URLs
  IS_RESOURCE_PAGE: /portal\.azure\.com.*(\/resource\/|resourceId[=%2F]|#.*\/subscriptions\/|#blade\/|#view\/)/i,
};

// DOM selectors for Azure Portal
export const PORTAL_SELECTORS = {
  // Tenant name display (format: "Display Name (domain.onmicrosoft.com)")
  TENANT_NAME: '.fxs-avatarmenu-tenant, .fxs-settings-currentdirectoryname',

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

// GUID regex pattern (used for tenant ID validation)
export const GUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// History debounce time (ms) before capturing navigation
export const HISTORY_DEBOUNCE_MS = 2000;

// Maximum items before pruning
export const MAX_ITEMS = {
  HISTORY: 500,
  BOOKMARKS: 150,
};
