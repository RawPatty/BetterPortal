// ARM Client for Azure Resource Manager API calls
import { getToken } from './token-extractor';
import { ARM_API } from '../../shared/constants';
import type { RoleAssignment } from '../../shared/types';

interface ArmResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

/**
 * Get the API version for a resource type
 */
function getApiVersion(resourceId: string): string {
  // Extract resource type from resource ID
  const match = resourceId.match(/providers\/([^/]+\/[^/]+)/i);
  if (match) {
    const resourceType = match[1];
    const version = ARM_API.API_VERSIONS[resourceType];
    if (version) {
      return version;
    }
  }
  return ARM_API.DEFAULT_API_VERSION;
}

/**
 * Make an authenticated request to ARM API
 */
async function armRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ArmResponse<T>> {
  const token = await getToken();

  if (!token) {
    return {
      success: false,
      error: 'No authentication token available. Please refresh the Azure portal.',
    };
  }

  const url = endpoint.startsWith('https://')
    ? endpoint
    : `${ARM_API.BASE_URL}${endpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `API request failed: ${response.status} ${response.statusText}`,
        statusCode: response.status,
      };
    }

    const data = await response.json();
    return {
      success: true,
      data,
      statusCode: response.status,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network request failed',
    };
  }
}

/**
 * Get resource state from ARM API
 */
export async function getResourceState(resourceId: string): Promise<ArmResponse<Record<string, unknown>>> {
  // Ensure resourceId starts with /
  const normalizedId = resourceId.startsWith('/') ? resourceId : `/${resourceId}`;
  const apiVersion = getApiVersion(resourceId);

  const endpoint = `${normalizedId}?api-version=${apiVersion}`;

  console.log('[BetterPortal] Fetching resource state:', endpoint);
  return armRequest(endpoint);
}

/**
 * Get IAM role assignments for a resource
 */
export async function getRoleAssignments(resourceId: string): Promise<ArmResponse<RoleAssignment[]>> {
  const normalizedId = resourceId.startsWith('/') ? resourceId : `/${resourceId}`;
  const endpoint = `${normalizedId}/providers/Microsoft.Authorization/roleAssignments?api-version=${ARM_API.ROLE_ASSIGNMENTS_VERSION}`;

  console.log('[BetterPortal] Fetching role assignments:', endpoint);

  const response = await armRequest<{ value: any[] }>(endpoint);

  if (!response.success || !response.data) {
    return {
      success: false,
      error: response.error || 'Failed to fetch role assignments',
    };
  }

  // Transform ARM response to our RoleAssignment format
  const assignments: RoleAssignment[] = response.data.value.map((item: any) => ({
    principalId: item.properties?.principalId || '',
    principalName: item.properties?.principalName || item.properties?.principalId || 'Unknown',
    roleDefinitionId: item.properties?.roleDefinitionId || '',
    roleName: extractRoleName(item.properties?.roleDefinitionId || ''),
    scope: item.properties?.scope || '',
  }));

  return {
    success: true,
    data: assignments,
  };
}

/**
 * Extract role name from role definition ID
 * e.g., /subscriptions/.../providers/Microsoft.Authorization/roleDefinitions/guid -> Contributor
 */
function extractRoleName(roleDefinitionId: string): string {
  // Common built-in roles
  const builtInRoles: Record<string, string> = {
    '8e3af657-a8ff-443c-a75c-2fe8c4bcb635': 'Owner',
    'b24988ac-6180-42a0-ab88-20f7382dd24c': 'Contributor',
    'acdd72a7-3385-48ef-bd42-f606fba81ae7': 'Reader',
    '18d7d88d-d35e-4fb5-a5c3-7773c20a72d9': 'User Access Administrator',
  };

  // Extract GUID from role definition ID
  const match = roleDefinitionId.match(/roleDefinitions\/([a-f0-9-]+)$/i);
  if (match) {
    const roleId = match[1];
    return builtInRoles[roleId] || roleId;
  }

  return 'Unknown Role';
}

/**
 * Check if a resource exists and is accessible
 */
export async function checkResourceAccess(resourceId: string): Promise<{
  accessible: boolean;
  error?: string;
}> {
  const response = await getResourceState(resourceId);

  if (response.success) {
    return { accessible: true };
  }

  if (response.statusCode === 404) {
    return { accessible: false, error: 'Resource not found' };
  }

  if (response.statusCode === 403) {
    return { accessible: false, error: 'Access denied' };
  }

  return { accessible: false, error: response.error };
}

/**
 * Batch check multiple resources
 */
export async function batchCheckResources(
  resourceIds: string[]
): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();

  // Process in batches of 5 to avoid rate limiting
  const batchSize = 5;
  for (let i = 0; i < resourceIds.length; i += batchSize) {
    const batch = resourceIds.slice(i, i + batchSize);
    const checks = await Promise.all(
      batch.map(async (id) => {
        const { accessible } = await checkResourceAccess(id);
        return { id, accessible };
      })
    );

    for (const { id, accessible } of checks) {
      results.set(id, accessible);
    }

    // Small delay between batches
    if (i + batchSize < resourceIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return results;
}
