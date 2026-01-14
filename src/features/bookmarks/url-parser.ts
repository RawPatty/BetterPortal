// URL Parser for Azure Portal URLs
import { PORTAL_URL_PATTERNS, PORTAL_SELECTORS } from '../../shared/constants';
import type { ParsedPortalUrl } from '../../shared/types';

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
  const resourceIdMatch = url.match(PORTAL_URL_PATTERNS.RESOURCE_ID);
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
      // Try subscription ID as fallback (for subscription-level pages)
      const subscriptionMatch = url.match(PORTAL_URL_PATTERNS.SUBSCRIPTION_ID);
      if (subscriptionMatch) {
        result.resourceId = `/subscriptions/${subscriptionMatch[1]}`;
        console.log('[BetterPortal] Extracted subscription ID:', result.resourceId);
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
  const isResource = PORTAL_URL_PATTERNS.IS_RESOURCE_PAGE.test(url);
  console.log('[BetterPortal] isResourcePage:', isResource, 'URL:', url.substring(0, 100));
  return isResource;
}

/**
 * Extract resource name from resource ID
 * e.g., /subscriptions/.../Microsoft.Storage/storageAccounts/mystorageaccount -> mystorageaccount
 */
export function extractResourceName(resourceId: string): string {
  const parts = resourceId.split('/');

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

  // Fallback: skip common blade names and return last meaningful segment
  const bladeNames = [
    'overview', 'configuration', 'settings', 'users', 'keys', 'networking',
    'containerslist', 'containers', 'blobs', 'files', 'queues', 'tables',
    'accesskeys', 'properties', 'diagnostics', 'metrics', 'logs', 'insights',
    'security', 'identity', 'encryption', 'firewall', 'networking', 'tags',
    'locks', 'export', 'automation', 'support', 'health', 'advisor',
    'default', 'blobservices', 'fileservices', 'queueservices', 'tableservices'
  ];

  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (part && !bladeNames.includes(part.toLowerCase())) {
      return part;
    }
  }

  return parts[parts.length - 1] || 'Unknown';
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
