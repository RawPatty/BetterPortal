// URL Parser for Azure Portal URLs
import { PORTAL_URL_PATTERNS, PORTAL_SELECTORS } from '../../shared/constants';
import type { ParsedPortalUrl } from '../../shared/types';

/**
 * Get the current directory info from the browser's current URL
 * Returns the domain (for comparison) and GUID if available
 */
export function getCurrentDirectoryInfo(): { domain: string | null; guid: string | null } {
  const url = window.location.href;

  // Extract domain from hash: #@domain.onmicrosoft.com/...
  const domainMatch = url.match(PORTAL_URL_PATTERNS.TENANT_DOMAIN);
  const domain = domainMatch ? domainMatch[1].toLowerCase() : null;

  // Extract GUID from path: portal.azure.com/GUID/...
  const guidMatch = url.match(PORTAL_URL_PATTERNS.TENANT_ID);
  const guid = guidMatch ? guidMatch[1] : null;

  return { domain, guid };
}

/**
 * Check if two directories are the same (comparing by domain)
 */
export function isSameDirectory(currentDomain: string | null, targetDomain: string | null): boolean {
  if (!currentDomain || !targetDomain) {
    // If we can't determine one of the domains, assume same directory (don't inject GUID)
    return true;
  }
  return currentDomain.toLowerCase() === targetDomain.toLowerCase();
}

/**
 * Parse an Azure Portal URL to extract tenant, resource, and blade info
 */
export function parsePortalUrl(url: string): ParsedPortalUrl {
  const result: ParsedPortalUrl = {
    tenantId: null,
    tenantDomain: null,
    resourceId: null,
    blade: null,
    fullUrl: url,
  };

  // Try to decode URL-encoded parts
  let decodedUrl = url;
  try {
    // Decode URL-encoded segments (like %2F -> /)
    if (url.includes('%2F') || url.includes('%24')) {
      decodedUrl = decodeURIComponent(url);
    }
  } catch {
    // Keep original if decode fails
  }

  // Extract tenant ID from URL path
  const tenantIdMatch = url.match(PORTAL_URL_PATTERNS.TENANT_ID);
  if (tenantIdMatch) {
    result.tenantId = tenantIdMatch[1];
  }

  // Extract tenant domain from hash
  const tenantDomainMatch = url.match(PORTAL_URL_PATTERNS.TENANT_DOMAIN);
  if (tenantDomainMatch) {
    result.tenantDomain = tenantDomainMatch[1];
  }

  // Extract resource ID (try multiple formats)
  const resourceIdMatch = decodedUrl.match(PORTAL_URL_PATTERNS.RESOURCE_ID);
  if (resourceIdMatch) {
    result.resourceId = resourceIdMatch[1];
  } else {
    // Try blade URL format (resourceId is URL-encoded)
    const bladeResourceIdMatch = url.match(PORTAL_URL_PATTERNS.BLADE_RESOURCE_ID);
    if (bladeResourceIdMatch) {
      try {
        result.resourceId = decodeURIComponent(bladeResourceIdMatch[1]);
      } catch {
        result.resourceId = bladeResourceIdMatch[1];
      }
    } else {
      // Try to extract from URL-encoded path with /path/ segment
      // e.g., storageAccounts%2Fname/path/%24web/etag/...
      const pathMatch = decodedUrl.match(/storageAccounts\/([^/]+)\/path\/([^/]+)/i);
      if (pathMatch) {
        // Reconstruct resource ID with container path
        const storageAccount = pathMatch[1];
        const containerName = pathMatch[2];
        // Find the full resource path before /path/
        const fullPathMatch = decodedUrl.match(/(\/subscriptions\/[^/]+\/resourceGroups\/[^/]+\/providers\/Microsoft\.Storage\/storageAccounts\/[^/]+)/i);
        if (fullPathMatch) {
          result.resourceId = `${fullPathMatch[1]}/blobServices/default/containers/${containerName}`;
        } else {
          // Try to construct from available info
          const rgMatch = decodedUrl.match(/resourceGroups\/([^/]+)/i);
          if (rgMatch) {
            result.resourceId = `/resourceGroups/${rgMatch[1]}/providers/Microsoft.Storage/storageAccounts/${storageAccount}/blobServices/default/containers/${containerName}`;
          }
        }
        console.log('[BetterPortal] Extracted from path format:', result.resourceId);
      } else {
        // Try subscription ID as fallback (for subscription-level pages)
        const subscriptionMatch = decodedUrl.match(PORTAL_URL_PATTERNS.SUBSCRIPTION_ID);
        if (subscriptionMatch) {
          result.resourceId = `/subscriptions/${subscriptionMatch[1]}`;
          console.log('[BetterPortal] Extracted subscription ID:', result.resourceId);
        }
      }
    }
  }

  // Extract blade name
  if (result.resourceId) {
    const parts = result.resourceId.split('/');
    const lastPart = parts[parts.length - 1];
    // Check if last part looks like a blade name (not a resource name)
    if (!lastPart.includes('subscriptions') &&
        !lastPart.includes('resourceGroups') &&
        !lastPart.includes('providers')) {
      // Could be a blade or the resource name itself
      // Blades are typically lowercase like 'configuration', 'overview', 'users'
      if (lastPart.match(/^[a-z]+$/)) {
        result.blade = lastPart;
      }
    }
  }

  return result;
}

/**
 * Check if a URL is a resource page
 */
export function isResourcePage(url: string): boolean {
  // Try both original and decoded URL
  let isResource = PORTAL_URL_PATTERNS.IS_RESOURCE_PAGE.test(url);

  if (!isResource) {
    // Try decoding and checking again
    try {
      const decodedUrl = decodeURIComponent(url);
      isResource = PORTAL_URL_PATTERNS.IS_RESOURCE_PAGE.test(decodedUrl);
    } catch {
      // Ignore decode errors
    }
  }

  // Also check for storage container path format
  if (!isResource && (url.includes('storageAccounts') || url.includes('storageAccounts%2F'))) {
    isResource = true;
  }

  console.log('[BetterPortal] isResourcePage:', isResource, 'URL:', url.substring(0, 100));
  return isResource;
}

// Common blade/view names in Azure portal
const BLADE_NAMES = new Set([
  'overview', 'configuration', 'settings', 'users', 'keys', 'networking',
  'containerslist', 'containers', 'blobs', 'files', 'queues', 'tables',
  'accesskeys', 'properties', 'diagnostics', 'metrics', 'logs', 'insights',
  'security', 'identity', 'encryption', 'firewall', 'tags', 'events',
  'locks', 'export', 'automation', 'support', 'health', 'advisor',
  'default', 'blobservices', 'fileservices', 'queueservices', 'tableservices',
  'accesscontrol', 'deployments', 'policies', 'alerts', 'activitylog',
  'costanalysis', 'budgets', 'recommendations', 'resourcehealth'
]);

/**
 * Extract resource name from resource ID
 * e.g., /subscriptions/.../Microsoft.Storage/storageAccounts/mystorageaccount -> mystorageaccount
 */
export function extractResourceName(resourceId: string): string {
  const parts = resourceId.split('/').filter(p => p.length > 0);

  // Find the providers segment and extract the resource name after the resource type
  // Pattern: .../providers/Microsoft.X/resourceType/resourceName/...
  const providersIndex = parts.findIndex(p => p.toLowerCase() === 'providers');
  if (providersIndex >= 0 && providersIndex + 3 < parts.length) {
    // providers/Microsoft.X/resourceType/resourceName
    const resourceName = parts[providersIndex + 3];
    if (resourceName && resourceName.length > 0) {
      return resourceName;
    }
  }

  // For resource groups: /subscriptions/{guid}/resourceGroups/{name}
  const rgIndex = parts.findIndex(p => p.toLowerCase() === 'resourcegroups');
  if (rgIndex >= 0 && rgIndex + 1 < parts.length) {
    // Check if there's no provider after it (meaning we're viewing the RG itself)
    if (providersIndex < 0 || providersIndex < rgIndex) {
      const rgName = parts[rgIndex + 1];
      if (rgName && rgName.length > 0) {
        return rgName;
      }
    }
  }

  // For subscriptions: /subscriptions/{guid}
  const subIndex = parts.findIndex(p => p.toLowerCase() === 'subscriptions');
  if (subIndex >= 0 && subIndex + 1 < parts.length) {
    const subId = parts[subIndex + 1];
    if (subId && subId.length > 0) {
      return subId;
    }
  }

  // Fallback: skip blade names and return last meaningful segment
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (part && !BLADE_NAMES.has(part.toLowerCase())) {
      return part;
    }
  }

  return parts[parts.length - 1] || 'Unknown';
}

// Service type names to skip in path (keep the actual resource names)
const SERVICE_TYPES = new Set([
  'blobservices', 'fileservices', 'queueservices', 'tableservices',
  'default', 'providers'
]);

/**
 * Extract the full resource path after the main resource
 * e.g., /storageAccounts/mystorageaccount/blobServices/default/containers/$web
 * Returns: ['containers', '$web']
 */
function extractSubResourcePath(resourceId: string): string[] {
  const parts = resourceId.split('/').filter(p => p.length > 0);
  const result: string[] = [];

  // Find the main resource (after providers/Microsoft.X/resourceType/resourceName)
  const providersIndex = parts.findIndex(p => p.toLowerCase() === 'providers');
  if (providersIndex >= 0 && providersIndex + 4 < parts.length) {
    // Everything after resourceName is sub-resource path
    const subParts = parts.slice(providersIndex + 4);

    for (const part of subParts) {
      const lowerPart = part.toLowerCase();
      // Skip service types and blade names, keep actual resource names
      if (!SERVICE_TYPES.has(lowerPart) && !BLADE_NAMES.has(lowerPart)) {
        result.push(part);
      } else if (BLADE_NAMES.has(lowerPart)) {
        // Include blade name at the end
        result.push(part);
      }
    }
  } else {
    // No providers section, check for blade at end
    if (parts.length > 0) {
      const lastPart = parts[parts.length - 1];
      if (BLADE_NAMES.has(lastPart.toLowerCase())) {
        result.push(lastPart);
      }
    }
  }

  return result;
}

/**
 * Extract full display name with resource and sub-resource hierarchy
 * e.g., "storageaccount1 | containers | $web"
 */
export function extractDisplayName(resourceId: string): string {
  const resourceName = extractResourceName(resourceId);
  const subPath = extractSubResourcePath(resourceId);

  // Filter out 'overview' from the path
  const filteredPath = subPath.filter(p => p.toLowerCase() !== 'overview');

  if (filteredPath.length > 0) {
    // Format: resourceName | path1 | path2 | ...
    return [resourceName, ...filteredPath].join(' | ');
  }

  return resourceName;
}

/**
 * Extract resource type from resource ID
 * e.g., /subscriptions/.../Microsoft.Web/sites/myapp -> Microsoft.Web/sites
 */
export function extractResourceType(resourceId: string): string {
  const match = resourceId.match(/providers\/([^/]+\/[^/]+)/i);
  if (match) {
    return match[1];
  }
  return 'Unknown';
}

/**
 * Generate display name for a bookmark/history entry
 */
export function generateDisplayName(resourceId: string, blade: string | null): string {
  const resourceName = extractResourceName(resourceId);
  if (blade && blade !== 'overview') {
    return `${resourceName} > ${blade}`;
  }
  return resourceName;
}

/**
 * Try to get tenant display name from the portal DOM
 */
export function getTenantNameFromDOM(): string | null {
  const element = document.querySelector(PORTAL_SELECTORS.TENANT_NAME);
  if (element) {
    return element.textContent?.trim() || null;
  }
  return null;
}

/**
 * Try to extract tenant ID from a JWT token
 */
function extractTenantFromJwt(token: string): string | null {
  try {
    // JWT format: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    // Decode the payload (base64url)
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(payload);
    const claims = JSON.parse(decoded);

    // The 'tid' claim contains the tenant ID
    const tid = claims.tid;
    if (tid && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tid)) {
      return tid;
    }
  } catch {
    // Invalid JWT
  }
  return null;
}

/**
 * Request the tenant GUID from the MAIN world content script (page-context.ts).
 * Uses a custom DOM event which synchronously crosses the isolated/main world boundary.
 *
 * IMPORTANT: Always re-extract - don't cache, as user may switch tenants!
 */
function extractTenantFromPageContext(): string | null {
  const ATTR_NAME = 'data-betterportal-tenant-guid';

  // Always clear previous value and re-extract (user may have switched tenants)
  document.documentElement.removeAttribute(ATTR_NAME);

  // Ask the MAIN world script to extract the GUID and write it to the DOM attribute.
  // Custom events dispatched on document are received synchronously by listeners in both worlds.
  document.dispatchEvent(new CustomEvent('betterportal:get-tenant'));

  // Read the result written by page-context.ts (MAIN world)
  const result = document.documentElement.getAttribute(ATTR_NAME);
  if (result) {
    console.log('[BetterPortal] Got tenant GUID from page context:', result);
    return result;
  }

  return null;
}

/**
 * Try to get tenant GUID from various sources in the portal (single attempt)
 */
function getTenantGuidFromPortalOnce(): string | null {
  const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const url = window.location.href;

  console.log('[BetterPortal] getTenantGuidFromPortal() called, URL:', url.substring(0, 150));

  // 1. Check URL path first (most reliable)
  const urlPathMatch = url.match(/portal\.azure\.com\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  if (urlPathMatch) {
    console.log('[BetterPortal] Found tenant GUID in URL path:', urlPathMatch[1]);
    return urlPathMatch[1];
  }

  // 2. Check URL query parameters (Azure Portal sometimes uses these)
  try {
    const urlObj = new URL(url);
    const directoryParams = ['directory', 'feature.directory', 'tid', 'tenantId', 'tenant'];
    for (const param of directoryParams) {
      const val = urlObj.searchParams.get(param);
      if (val && guidRegex.test(val)) {
        console.log('[BetterPortal] Found tenant GUID in query param:', param, '=', val);
        return val;
      }
    }
  } catch {
    // URL parsing failed
  }

  // 3. Try to extract from page context (window objects) via injected script
  const pageContextGuid = extractTenantFromPageContext();
  if (pageContextGuid) {
    return pageContextGuid;
  }

  // 4. Check MSAL/Auth tokens in sessionStorage (Azure Portal stores JWT tokens here)
  // IMPORTANT: MSAL caches tokens for ALL tenants user has authenticated to.
  // We need to find tokens that match the CURRENT tenant (from URL domain).
  try {
    // Get the current URL domain to match against tokens
    const urlDomainMatch = url.match(/#@([^/#]+)/);
    const currentDomain = urlDomainMatch ? urlDomainMatch[1].toLowerCase() : null;
    console.log('[BetterPortal] Looking for MSAL tokens, current domain:', currentDomain);

    // Collect all found GUIDs with their domains for smart matching
    const foundTokens: Array<{ guid: string; domain: string | null; key: string }> = [];

    // Helper to extract tenant info from JWT
    const extractTenantInfo = (token: string): { guid: string | null; domain: string | null } => {
      try {
        const parts = token.split('.');
        if (parts.length !== 3) return { guid: null, domain: null };
        const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const decoded = atob(payload);
        const claims = JSON.parse(decoded);
        const tid = claims.tid;
        // Try to get domain from 'upn' (user principal name) or 'idp' claims
        let domain: string | null = null;
        if (claims.upn && claims.upn.includes('@')) {
          domain = claims.upn.split('@')[1].toLowerCase();
        } else if (claims.idp) {
          domain = claims.idp.toLowerCase();
        } else if (claims.iss && claims.iss.includes('/')) {
          // issuer often contains tenant info
          const issMatch = claims.iss.match(/\/([a-f0-9-]{36})\//i);
          if (issMatch) {
            // Can't get domain from issuer GUID, but tid is the same
          }
        }
        if (tid && guidRegex.test(tid)) {
          return { guid: tid, domain };
        }
      } catch {
        // Invalid JWT
      }
      return { guid: null, domain: null };
    };

    // Search sessionStorage
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key) continue;

      // MSAL stores tokens with keys like "msal.{clientId}.idtoken" or similar
      if (key.includes('msal') || key.includes('token') || key.includes('accessToken') || key.includes('idToken')) {
        const val = sessionStorage.getItem(key);
        if (!val) continue;

        // Check if key contains the domain (MSAL sometimes includes tenant in key)
        const keyLower = key.toLowerCase();
        let keyDomain: string | null = null;
        if (currentDomain && keyLower.includes(currentDomain)) {
          keyDomain = currentDomain;
        }

        // Check if it's a JWT token
        if (val.includes('.') && val.split('.').length === 3) {
          const info = extractTenantInfo(val);
          if (info.guid) {
            foundTokens.push({ guid: info.guid, domain: keyDomain || info.domain, key });
          }
        }

        // Try parsing as JSON (MSAL sometimes stores token objects)
        try {
          const parsed = JSON.parse(val);
          const tokenFields = ['idToken', 'accessToken', 'secret', 'credential'];
          for (const field of tokenFields) {
            if (parsed[field] && typeof parsed[field] === 'string') {
              const info = extractTenantInfo(parsed[field]);
              if (info.guid) {
                foundTokens.push({ guid: info.guid, domain: keyDomain || info.domain, key: `${key}.${field}` });
              }
            }
          }
          // Direct tenantId in object
          const directTid = parsed.tenantId || parsed.tid || parsed.realm;
          if (directTid && guidRegex.test(directTid)) {
            foundTokens.push({ guid: directTid, domain: keyDomain, key });
          }
        } catch {
          // Not JSON
        }
      }
    }

    // Also check localStorage for MSAL tokens
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      if (key.includes('msal') || key.includes('token')) {
        const val = localStorage.getItem(key);
        if (!val) continue;

        const keyLower = key.toLowerCase();
        let keyDomain: string | null = null;
        if (currentDomain && keyLower.includes(currentDomain)) {
          keyDomain = currentDomain;
        }

        if (val.includes('.') && val.split('.').length === 3) {
          const info = extractTenantInfo(val);
          if (info.guid) {
            foundTokens.push({ guid: info.guid, domain: keyDomain || info.domain, key: `localStorage.${key}` });
          }
        }
        try {
          const parsed = JSON.parse(val);
          const directTid = parsed.tenantId || parsed.tid || parsed.realm;
          if (directTid && guidRegex.test(directTid)) {
            foundTokens.push({ guid: directTid, domain: keyDomain, key: `localStorage.${key}` });
          }
        } catch {
          // Not JSON
        }
      }
    }

    console.log('[BetterPortal] Found', foundTokens.length, 'MSAL tokens');

    // Now find the best matching token
    if (foundTokens.length > 0) {
      // First priority: token with domain matching current URL domain
      if (currentDomain) {
        const matchingToken = foundTokens.find(t => t.domain === currentDomain);
        if (matchingToken) {
          console.log('[BetterPortal] Found MSAL token matching current domain:', matchingToken.guid, 'key:', matchingToken.key);
          return matchingToken.guid;
        }
      }

      // Second priority: any token (may be wrong after directory switch)
      console.log('[BetterPortal] No domain match, using first MSAL token:', foundTokens[0].guid, '(may be wrong tenant!)');
      return foundTokens[0].guid;
    }
  } catch (e) {
    console.log('[BetterPortal] Error searching MSAL tokens:', e);
  }

  // 4. Check sessionStorage and localStorage for direct tenant keys
  try {
    const storageKeys = ['tenantId', 'tenant_id', 'currentTenant', 'selectedTenant', 'directory'];
    for (const key of storageKeys) {
      const sessionVal = sessionStorage.getItem(key);
      if (sessionVal && guidRegex.test(sessionVal)) {
        console.log('[BetterPortal] Found tenant GUID in sessionStorage:', sessionVal);
        return sessionVal;
      }
      const localVal = localStorage.getItem(key);
      if (localVal && guidRegex.test(localVal)) {
        console.log('[BetterPortal] Found tenant GUID in localStorage:', localVal);
        return localVal;
      }
    }

    // Check for Azure-specific storage keys
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && (key.toLowerCase().includes('tenant') || key.toLowerCase().includes('directory'))) {
        const val = sessionStorage.getItem(key);
        if (val) {
          // Try to parse as JSON
          try {
            const parsed = JSON.parse(val);
            const id = parsed.tenantId || parsed.id || parsed.directoryId;
            if (id && guidRegex.test(id)) {
              console.log('[BetterPortal] Found tenant GUID in sessionStorage JSON:', id, 'key:', key);
              return id;
            }
          } catch {
            if (guidRegex.test(val)) {
              console.log('[BetterPortal] Found tenant GUID in sessionStorage:', val, 'key:', key);
              return val;
            }
          }
        }
      }
    }
  } catch {
    // Storage access might fail
  }

  // 5. Check data attributes
  const dataAttrs = document.querySelectorAll('[data-tenant-id], [data-tenantid], [data-directory-id]');
  for (const el of dataAttrs) {
    const val = el.getAttribute('data-tenant-id') || el.getAttribute('data-tenantid') || el.getAttribute('data-directory-id');
    if (val && guidRegex.test(val)) {
      console.log('[BetterPortal] Found tenant GUID in data attribute:', val);
      return val;
    }
  }

  // 6. Search all iframes for tenant info (Azure Portal uses iframes)
  try {
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      const src = iframe.src || '';
      const iframeMatch = src.match(/tenant[Ii]d[=\/]([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      if (iframeMatch) {
        console.log('[BetterPortal] Found tenant GUID in iframe src:', iframeMatch[1]);
        return iframeMatch[1];
      }
    }
  } catch {
    // Ignore iframe access errors
  }

  console.log('[BetterPortal] Could not find tenant GUID in DOM/storage');
  return null;
}

/**
 * Try to get tenant GUID with retries and delays
 * After switching directories, Azure Portal takes time to update its state
 * This function will retry multiple times with increasing delays
 */
export async function getTenantGuidFromPortalWithRetry(
  maxRetries: number = 5,
  initialDelayMs: number = 300
): Promise<string | null> {
  console.log('[BetterPortal] Getting tenant GUID with retry (max attempts:', maxRetries, ')');

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Try to get the GUID
    const guid = getTenantGuidFromPortalOnce();

    if (guid) {
      console.log('[BetterPortal] Found tenant GUID on attempt', attempt + 1, ':', guid);
      return guid;
    }

    // If this isn't the last attempt, wait before retrying
    if (attempt < maxRetries - 1) {
      const delay = initialDelayMs * Math.pow(1.5, attempt); // Exponential backoff
      console.log('[BetterPortal] Tenant GUID not found, waiting', Math.round(delay), 'ms before retry', attempt + 2);
      await new Promise(resolve => setTimeout(resolve, delay));

      // Check if URL has changed (might have GUID now after redirect)
      const newUrl = window.location.href;
      const urlGuidMatch = newUrl.match(/portal\.azure\.com\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      if (urlGuidMatch) {
        console.log('[BetterPortal] Found tenant GUID in URL after waiting:', urlGuidMatch[1]);
        return urlGuidMatch[1];
      }
    }
  }

  console.log('[BetterPortal] Could not find tenant GUID after', maxRetries, 'attempts');
  return null;
}

/**
 * Synchronous version for backwards compatibility - tries once without retry
 */
export function getTenantGuidFromPortal(): string | null {
  return getTenantGuidFromPortalOnce();
}

/**
 * Strip blade suffix from resource name (e.g., "my-resource | Overview" -> "my-resource")
 */
function stripBladeSuffix(name: string): string {
  // Strip blade names like "| Overview", "| Configuration", etc.
  const bladeMatch = name.match(/^(.+?)\s*\|\s*\w+$/);
  if (bladeMatch) {
    return bladeMatch[1].trim();
  }
  return name;
}

/**
 * Wait for DOM to update with retries
 */
export async function getResourceNameFromDOMWithRetry(maxRetries: number = 3, delayMs: number = 500): Promise<string | null> {
  for (let i = 0; i < maxRetries; i++) {
    const name = getResourceNameFromDOM();
    if (name) {
      return name;
    }
    // Wait before retrying
    if (i < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  return null;
}

/**
 * Try to get resource display name from the portal DOM
 */
export function getResourceNameFromDOM(): string | null {
  // Try various selectors for resource/subscription names
  const selectors = [
    PORTAL_SELECTORS.RESOURCE_NAME,
    // Subscription name in overview blade
    '.fxs-blade-title-titleText',
    '.fxs-journey-breadcrumb-title',
    // Subscription display name in header
    '[data-bind*="text: displayName"]',
    'h2.msportalfx-text-header',
    '.ext-azure-subscription-name',
    // Generic header elements
    '.fxs-blade-header-title',
    '.azc-formElementSubLabelContainer',
  ];

  for (const selector of selectors) {
    try {
      const element = document.querySelector(selector);
      if (element) {
        let name = element.textContent?.trim();
        // Skip if it's just a GUID or empty
        if (name && name.length > 0) {
          // Strip blade suffix like "| Overview"
          name = stripBladeSuffix(name);
          if (!isGuid(name)) {
            console.log('[BetterPortal] Found resource name via selector:', selector, '->', name);
            return name;
          }
        }
      }
    } catch {
      // Selector might be invalid
    }
  }

  // Try the page title (often contains resource name)
  const pageTitle = document.title;
  if (pageTitle) {
    // Extract the first part before " - Microsoft Azure"
    const match = pageTitle.match(/^(.+?)\s*[-–—]\s*Microsoft Azure/i);
    if (match) {
      let name = stripBladeSuffix(match[1].trim());
      if (name && !isGuid(name)) {
        console.log('[BetterPortal] Found resource name via page title:', name);
        return name;
      }
    }
  }

  console.log('[BetterPortal] Could not find resource name in DOM');
  return null;
}

/**
 * Check if a string looks like a GUID
 */
function isGuid(str: string): boolean {
  return /^[a-f0-9-]{36}$/i.test(str.trim());
}

/**
 * Check if the current page is showing an error state
 * This is used to avoid capturing error pages in history
 */
export function isErrorPage(): boolean {
  // Check for common Azure Portal error indicators
  const errorSelectors = [
    // Error blade/page indicators
    '.fxs-blade-error',
    '.fxs-error',
    '.msportalfx-error',
    '[class*="error-page"]',
    '[class*="errorpage"]',
    // Access denied / authorization errors
    '.fxs-blade-unauthorized',
    '[data-telemetryname*="Error"]',
    '[data-telemetryname*="error"]',
    // Generic error containers
    '.ext-error-container',
    '.azc-error',
  ];

  for (const selector of errorSelectors) {
    try {
      if (document.querySelector(selector)) {
        return true;
      }
    } catch {
      // Selector might be invalid
    }
  }

  // Check page title for error indicators
  const pageTitle = document.title.toLowerCase();
  if (pageTitle.includes('error') ||
      pageTitle.includes('not found') ||
      pageTitle.includes('access denied') ||
      pageTitle.includes('unauthorized')) {
    return true;
  }

  // Check for error text in the main content area
  const bodyText = document.body?.innerText?.toLowerCase() || '';
  const errorPhrases = [
    'the access token is from the wrong issuer',
    'token issuer',
    'issuer does not match',
    'resource not found',
    'you do not have access',
    'access has been denied',
    'authorization failed',
    'the resource you are looking for',
  ];

  for (const phrase of errorPhrases) {
    if (bodyText.includes(phrase)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a resource ID represents a subscription (not a child resource)
 */
export function isSubscriptionResource(resourceId: string): boolean {
  // Subscription URL pattern: /subscriptions/{guid} without providers
  const normalized = resourceId.toLowerCase();
  return /^\/subscriptions\/[a-f0-9-]+\/?$/i.test(normalized) ||
         (normalized.includes('/subscriptions/') && !normalized.includes('/providers/') && !normalized.includes('/resourcegroups/'));
}

/**
 * Build a portal URL with tenant ID
 */
export function buildPortalUrl(
  tenantId: string,
  resourceId: string,
  includeFullPath: boolean = true
): string {
  const base = `https://portal.azure.com/${tenantId}`;

  if (!resourceId) {
    return base;
  }

  // Ensure resourceId starts with /
  const normalizedResourceId = resourceId.startsWith('/')
    ? resourceId
    : `/${resourceId}`;

  return `${base}/#blade/HubsExtension/BrowseResource/id${encodeURIComponent(normalizedResourceId)}`;
}

/**
 * Strip blade from resource URL to get base resource URL
 */
export function stripBlade(url: string): string {
  // Remove the last path segment if it looks like a blade
  const bladeNames = ['overview', 'configuration', 'settings', 'users', 'keys',
                      'networking', 'identity', 'monitoring', 'diagnostics',
                      'accessPolicies', 'secrets', 'certificates'];

  for (const blade of bladeNames) {
    const pattern = new RegExp(`/${blade}([?#]|$)`, 'i');
    if (pattern.test(url)) {
      return url.replace(pattern, '$1');
    }
  }

  return url;
}

/**
 * Normalize a portal URL (ensure consistent format)
 */
export function normalizePortalUrl(url: string): string {
  // Remove trailing slashes
  let normalized = url.replace(/\/+$/, '');

  // Ensure https
  if (normalized.startsWith('http://')) {
    normalized = normalized.replace('http://', 'https://');
  }

  return normalized;
}

/**
 * Strip the tenant GUID from a portal URL path.
 * Used for same-directory navigation to avoid re-auth redirects.
 *
 * e.g., https://portal.azure.com/abc-guid/#@contoso... → https://portal.azure.com/#@contoso...
 *
 * Azure Portal treats any URL with a GUID in the path as a directory-switch request,
 * triggering re-authentication even if you're already in that directory.
 */
export function stripTenantGuidFromUrl(url: string): string {
  return url.replace(
    /portal\.azure\.com\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i,
    'portal.azure.com/'
  );
}

/**
 * Build a navigation URL with tenant context for cross-tenant navigation
 *
 * Correct format for cross-tenant navigation:
 * https://portal.azure.com/{tenantGUID}/?queryParams#@{domain}/resource/{resourcePath}
 *
 * The GUID in the path authenticates you to the directory.
 * Query parameters (like ?l=en.en-us) are preserved for language/feature settings.
 * The #@domain/resource/... navigates to the actual resource.
 * ALL parts are needed for reliable cross-tenant navigation.
 *
 * @param url - The original bookmark/history URL
 * @param tenantId - The tenant identifier (GUID preferred, domain fallback)
 * @returns URL with tenant context for navigation
 */
export function buildNavigationUrl(url: string, tenantId: string): string {
  if (!tenantId || tenantId === 'unknown') {
    return url;
  }

  const isGuidTenant = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId);

  if (isGuidTenant) {
    // Check if URL already has this GUID in the path
    if (url.includes(`portal.azure.com/${tenantId}`)) {
      return url; // Already correct
    }

    // Parse URL to extract query parameters and hash
    // URL format: https://portal.azure.com/oldGUID/?params#hash
    const hashIndex = url.indexOf('#');
    const queryIndex = url.indexOf('?');

    let queryPart = '';
    let hashPart = '';

    if (hashIndex !== -1) {
      hashPart = url.substring(hashIndex);
      // Check if there's a query string before the hash
      if (queryIndex !== -1 && queryIndex < hashIndex) {
        queryPart = url.substring(queryIndex, hashIndex);
      }
    } else if (queryIndex !== -1) {
      // Query params but no hash
      queryPart = url.substring(queryIndex);
    }

    // Build the new URL with GUID, preserving query params and hash
    // Format: portal.azure.com/GUID/?params#hash
    if (hashPart || queryPart) {
      return `https://portal.azure.com/${tenantId}/${queryPart}${hashPart}`;
    }

    // If no hash or query, just add tenant to base URL
    return `https://portal.azure.com/${tenantId}/`;
  }

  // Fallback: use #@domain format (may not switch directories)
  // Only use this if we don't have a GUID
  if (!url.includes('#@')) {
    return url.replace('/#', `/#@${tenantId}`);
  }

  return url;
}
