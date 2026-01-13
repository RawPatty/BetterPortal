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

  // Extract resource ID (try /resource/ format first, then blade format)
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
  return PORTAL_URL_PATTERNS.IS_RESOURCE_PAGE.test(url);
}

/**
 * Extract resource name from resource ID
 * e.g., /subscriptions/.../sites/myapp -> myapp
 */
export function extractResourceName(resourceId: string): string {
  const parts = resourceId.split('/');
  // Resource name is typically the last meaningful segment
  // Skip common blade names
  const bladeNames = ['overview', 'configuration', 'settings', 'users', 'keys', 'networking'];

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
