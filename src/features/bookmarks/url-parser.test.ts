import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  parsePortalUrl,
  isResourcePage,
  extractResourceName,
  extractResourceType,
  generateDisplayName,
  extractDisplayName,
  stripBlade,
  normalizePortalUrl,
  isSubscriptionResource,
  buildNavigationUrl,
  stripTenantGuidFromUrl,
  getTenantGuidFromPortal,
} from './url-parser';

describe('url-parser', () => {
  describe('parsePortalUrl', () => {
    it('should extract tenant ID from URL path', () => {
      const url = 'https://portal.azure.com/12345678-1234-1234-1234-123456789abc/#blade/...';
      const result = parsePortalUrl(url);
      expect(result.tenantId).toBe('12345678-1234-1234-1234-123456789abc');
    });

    it('should extract tenant domain from hash', () => {
      const url = 'https://portal.azure.com/#@contoso.onmicrosoft.com/resource/subscriptions/...';
      const result = parsePortalUrl(url);
      expect(result.tenantDomain).toBe('contoso.onmicrosoft.com');
    });

    it('should extract resource ID', () => {
      const url = 'https://portal.azure.com/#@contoso.com/resource/subscriptions/sub-123/resourceGroups/rg-test/providers/Microsoft.Web/sites/my-app';
      const result = parsePortalUrl(url);
      expect(result.resourceId).toBe('subscriptions/sub-123/resourceGroups/rg-test/providers/Microsoft.Web/sites/my-app');
    });

    it('should handle URLs without resource ID', () => {
      const url = 'https://portal.azure.com/#home';
      const result = parsePortalUrl(url);
      expect(result.resourceId).toBeNull();
    });
  });

  describe('isResourcePage', () => {
    it('should return true for resource pages', () => {
      expect(isResourcePage('https://portal.azure.com/#@tenant/resource/subscriptions/...')).toBe(true);
    });

    it('should return false for non-resource pages', () => {
      expect(isResourcePage('https://portal.azure.com/#home')).toBe(false);
    });
  });

  describe('extractResourceName', () => {
    it('should extract resource name from resource ID', () => {
      const resourceId = 'subscriptions/sub-123/resourceGroups/rg-test/providers/Microsoft.Web/sites/my-app';
      expect(extractResourceName(resourceId)).toBe('my-app');
    });

    it('should skip common blade names', () => {
      const resourceId = 'subscriptions/sub-123/resourceGroups/rg-test/providers/Microsoft.Web/sites/my-app/configuration';
      expect(extractResourceName(resourceId)).toBe('my-app');
    });
  });

  describe('extractResourceType', () => {
    it('should extract resource type from resource ID', () => {
      const resourceId = 'subscriptions/sub-123/resourceGroups/rg-test/providers/Microsoft.Web/sites/my-app';
      expect(extractResourceType(resourceId)).toBe('Microsoft.Web/sites');
    });

    it('should return Unknown for invalid resource ID', () => {
      const resourceId = 'subscriptions/sub-123/resourceGroups/rg-test';
      expect(extractResourceType(resourceId)).toBe('Unknown');
    });
  });

  describe('generateDisplayName', () => {
    it('should generate display name with blade', () => {
      const resourceId = 'subscriptions/sub-123/resourceGroups/rg-test/providers/Microsoft.Web/sites/my-app';
      expect(generateDisplayName(resourceId, 'configuration')).toBe('my-app > configuration');
    });

    it('should generate display name without blade for overview', () => {
      const resourceId = 'subscriptions/sub-123/resourceGroups/rg-test/providers/Microsoft.Web/sites/my-app';
      expect(generateDisplayName(resourceId, 'overview')).toBe('my-app');
    });

    it('should generate display name without blade when null', () => {
      const resourceId = 'subscriptions/sub-123/resourceGroups/rg-test/providers/Microsoft.Web/sites/my-app';
      expect(generateDisplayName(resourceId, null)).toBe('my-app');
    });
  });

  describe('stripBlade', () => {
    it('should remove blade from URL', () => {
      const url = 'https://portal.azure.com/#@tenant/resource/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/app/configuration';
      const result = stripBlade(url);
      expect(result).not.toContain('/configuration');
    });

    it('should keep URL unchanged if no blade', () => {
      const url = 'https://portal.azure.com/#@tenant/resource/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/app';
      expect(stripBlade(url)).toBe(url);
    });
  });

  describe('normalizePortalUrl', () => {
    it('should remove trailing slashes', () => {
      expect(normalizePortalUrl('https://portal.azure.com/test/')).toBe('https://portal.azure.com/test');
    });

    it('should upgrade http to https', () => {
      expect(normalizePortalUrl('http://portal.azure.com/test')).toBe('https://portal.azure.com/test');
    });
  });

  // Bug fix tests: URL-encoded paths
  describe('parsePortalUrl with URL-encoded paths', () => {
    it('should decode URL-encoded resource paths with %2F', () => {
      // Standard resource URL with encoded slashes
      const url = 'https://portal.azure.com/#@tenant/resource%2Fsubscriptions%2F12345678-1234-1234-1234-123456789abc%2FresourceGroups%2FMyResourceGroup%2Fproviders%2FMicrosoft.Storage%2FstorageAccounts%2Fmystorageaccount';
      const result = parsePortalUrl(url);
      expect(result.resourceId).toContain('storageAccounts');
      expect(result.resourceId).toContain('mystorageaccount');
    });

    it('should handle storage container path format with %24 ($)', () => {
      const url = 'https://portal.azure.com/#view/Microsoft_Azure_Storage/BlobContainerMenuBlade/~/overview/storageAccountId/%2Fsubscriptions%2F12345678%2FresourceGroups%2FJsunFrontendResourceGroup988ee6fb%2Fproviders%2FMicrosoft.Storage%2FstorageAccounts%2Fjsunoneui5f7e23de/path/%24web/etag/%220x8DE52FB449A3EDD%22';
      const result = parsePortalUrl(url);
      expect(result.resourceId).not.toBeNull();
      // Should extract the container path
      expect(result.resourceId).toContain('containers');
      expect(result.resourceId).toContain('$web');
    });

    it('should handle deeply nested URL-encoded paths', () => {
      const url = 'https://portal.azure.com/#view/Microsoft_Azure_Storage/BlobContainerMenuBlade/resourceGroups%2FMyRG%2Fproviders%2FMicrosoft.Storage%2FstorageAccounts%2Fmyaccount/path/%24web';
      const result = parsePortalUrl(url);
      // Should be recognized as a resource page
      expect(isResourcePage(url)).toBe(true);
    });
  });

  // Bug fix tests: extractResourceName for various resource types
  describe('extractResourceName for different resource types', () => {
    it('should extract storage account name (not containersList)', () => {
      const resourceId = '/subscriptions/sub-123/resourceGroups/rg-test/providers/Microsoft.Storage/storageAccounts/mystorageaccount';
      expect(extractResourceName(resourceId)).toBe('mystorageaccount');
    });

    it('should extract storage account name even with nested paths', () => {
      const resourceId = '/subscriptions/sub-123/resourceGroups/rg-test/providers/Microsoft.Storage/storageAccounts/mystorageaccount/blobServices/default/containers/$web';
      expect(extractResourceName(resourceId)).toBe('mystorageaccount');
    });

    it('should extract resource group name when viewing a resource group', () => {
      const resourceId = '/subscriptions/sub-123/resourceGroups/my-resource-group';
      expect(extractResourceName(resourceId)).toBe('my-resource-group');
    });

    it('should extract subscription ID when viewing a subscription', () => {
      const resourceId = '/subscriptions/12345678-1234-1234-1234-123456789abc';
      expect(extractResourceName(resourceId)).toBe('12345678-1234-1234-1234-123456789abc');
    });

    it('should extract managed identity name', () => {
      const resourceId = '/subscriptions/sub-123/resourceGroups/rg-test/providers/Microsoft.ManagedIdentity/userAssignedIdentities/my-identity';
      expect(extractResourceName(resourceId)).toBe('my-identity');
    });

    it('should extract App Service name', () => {
      const resourceId = '/subscriptions/sub-123/resourceGroups/rg-test/providers/Microsoft.Web/sites/my-webapp';
      expect(extractResourceName(resourceId)).toBe('my-webapp');
    });

    it('should skip blade names like containersList', () => {
      const resourceId = '/subscriptions/sub-123/resourceGroups/rg-test/providers/Microsoft.Storage/storageAccounts/mystorageaccount/containersList';
      expect(extractResourceName(resourceId)).toBe('mystorageaccount');
    });

    it('should skip blade names like overview', () => {
      const resourceId = '/subscriptions/sub-123/resourceGroups/rg-test/providers/Microsoft.Storage/storageAccounts/mystorageaccount/overview';
      expect(extractResourceName(resourceId)).toBe('mystorageaccount');
    });
  });

  // Bug fix tests: extractDisplayName with hierarchy (pipe separator)
  describe('extractDisplayName with sub-resource hierarchy', () => {
    it('should return just resource name for simple resources', () => {
      const resourceId = '/subscriptions/sub-123/resourceGroups/rg-test/providers/Microsoft.Storage/storageAccounts/mystorageaccount';
      expect(extractDisplayName(resourceId)).toBe('mystorageaccount');
    });

    it('should include container name with pipe separator', () => {
      const resourceId = '/subscriptions/sub-123/resourceGroups/rg-test/providers/Microsoft.Storage/storageAccounts/mystorageaccount/blobServices/default/containers/$web';
      const displayName = extractDisplayName(resourceId);
      expect(displayName).toContain('mystorageaccount');
      expect(displayName).toContain('|');
      expect(displayName).toContain('$web');
    });

    it('should format as resourceName | containers | containerName', () => {
      const resourceId = '/subscriptions/sub-123/resourceGroups/rg-test/providers/Microsoft.Storage/storageAccounts/storageaccount1/blobServices/default/containers/$web';
      const displayName = extractDisplayName(resourceId);
      // Should be "storageaccount1 | containers | $web" or similar
      expect(displayName).toMatch(/storageaccount1.*\|.*\$web/);
    });

    it('should not include overview in the display name', () => {
      const resourceId = '/subscriptions/sub-123/resourceGroups/rg-test/providers/Microsoft.Storage/storageAccounts/mystorageaccount/overview';
      const displayName = extractDisplayName(resourceId);
      expect(displayName).toBe('mystorageaccount');
      expect(displayName).not.toContain('overview');
    });

    it('should handle queue services', () => {
      const resourceId = '/subscriptions/sub-123/resourceGroups/rg-test/providers/Microsoft.Storage/storageAccounts/mystorageaccount/queueServices/default/queues/my-queue';
      const displayName = extractDisplayName(resourceId);
      expect(displayName).toContain('mystorageaccount');
      expect(displayName).toContain('my-queue');
    });
  });

  // Bug fix tests: isResourcePage with storage accounts
  describe('isResourcePage with storage accounts', () => {
    it('should return true for URL-encoded storage account URLs', () => {
      const url = 'https://portal.azure.com/#view/storageAccounts%2Fjsunoneui5f7e23de/path/%24web';
      expect(isResourcePage(url)).toBe(true);
    });

    it('should return true for decoded storage account URLs', () => {
      const url = 'https://portal.azure.com/#view/storageAccounts/mystorageaccount/path/$web';
      expect(isResourcePage(url)).toBe(true);
    });

    it('should return true for standard resource URLs', () => {
      const url = 'https://portal.azure.com/#@tenant/resource/subscriptions/sub-123/resourceGroups/rg/providers/Microsoft.Storage/storageAccounts/myaccount';
      expect(isResourcePage(url)).toBe(true);
    });
  });

  // Bug fix tests: isSubscriptionResource
  describe('isSubscriptionResource', () => {
    it('should return true for subscription-only resource ID', () => {
      expect(isSubscriptionResource('/subscriptions/12345678-1234-1234-1234-123456789abc')).toBe(true);
    });

    it('should return true for subscription with trailing slash', () => {
      expect(isSubscriptionResource('/subscriptions/12345678-1234-1234-1234-123456789abc/')).toBe(true);
    });

    it('should return false for resource group resources', () => {
      expect(isSubscriptionResource('/subscriptions/sub-123/resourceGroups/my-rg')).toBe(false);
    });

    it('should return false for provider resources', () => {
      expect(isSubscriptionResource('/subscriptions/sub-123/resourceGroups/rg/providers/Microsoft.Web/sites/app')).toBe(false);
    });
  });

  // Bug fix tests: handling missing/inaccessible resources
  describe('parsePortalUrl with inaccessible resources', () => {
    it('should extract resource info from encoded URL with etag', () => {
      // This is the URL pattern when user doesn't have network access to a container
      const url = 'https://portal.azure.com/#view/Microsoft_Azure_Storage/resourceGroups%2FJsunFrontendResourceGroup988ee6fb%2Fproviders%2FMicrosoft.Storage%2FstorageAccounts%2Fjsunoneui5f7e23de/path/%24web/etag/%220x8DE52FB449A3EDD%22/defaultId//publicAccessVal/None';
      const result = parsePortalUrl(url);
      // Should not be null or 'unknown'
      expect(result.resourceId).not.toBeNull();
      expect(result.resourceId).not.toBe('unknown');
    });
  });

  // Cross-tenant navigation URL building tests
  describe('buildNavigationUrl', () => {
    const baseUrl = 'https://portal.azure.com/#@contoso.onmicrosoft.com/resource/subscriptions/sub-123/resourceGroups/rg-test/providers/Microsoft.Web/sites/my-app';
    const tenantGuid = '12345678-1234-1234-1234-123456789abc';
    const tenantDomain = 'contoso.onmicrosoft.com';

    describe('with GUID tenant ID', () => {
      it('should inject GUID into URL path for cross-tenant navigation', () => {
        const result = buildNavigationUrl(baseUrl, tenantGuid);
        expect(result).toContain(`portal.azure.com/${tenantGuid}/`);
        expect(result).toMatch(/portal\.azure\.com\/[a-f0-9-]{36}\//i);
      });

      it('should keep #@domain when GUID is provided (needed for resource navigation)', () => {
        const result = buildNavigationUrl(baseUrl, tenantGuid);
        // Should keep #@domain - needed for the portal to navigate to the resource
        expect(result).toContain('#@contoso.onmicrosoft.com');
        expect(result).toContain('/resource/');
      });

      it('should produce correct URL format: portal.azure.com/{GUID}/#@domain/resource/...', () => {
        const result = buildNavigationUrl(baseUrl, tenantGuid);
        // Verify the exact format - GUID in path, #@domain preserved
        expect(result).toBe(`https://portal.azure.com/${tenantGuid}/#@contoso.onmicrosoft.com/resource/subscriptions/sub-123/resourceGroups/rg-test/providers/Microsoft.Web/sites/my-app`);
      });

      it('should have tenantId as the segment between portal.azure.com/ and /#@', () => {
        const result = buildNavigationUrl(baseUrl, tenantGuid);
        // Extract the segment between portal.azure.com/ and /#@
        const match = result.match(/portal\.azure\.com\/([^/]+)\/#@/);
        expect(match).not.toBeNull();
        expect(match![1]).toBe(tenantGuid);
      });

      it('should not double-inject GUID if already present in URL', () => {
        const urlWithGuid = `https://portal.azure.com/${tenantGuid}/#@contoso.onmicrosoft.com/resource/...`;
        const result = buildNavigationUrl(urlWithGuid, tenantGuid);
        // Should not have duplicate GUIDs
        const guidMatches = result.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi);
        expect(guidMatches?.length).toBe(1);
        // Should keep #@domain (needed for navigation)
        expect(result).toContain('#@contoso.onmicrosoft.com');
      });

      it('should work with different tenant GUIDs', () => {
        const tenantA = '11111111-1111-1111-1111-111111111111';
        const tenantB = '22222222-2222-2222-2222-222222222222';

        const resultA = buildNavigationUrl(baseUrl, tenantA);
        const resultB = buildNavigationUrl(baseUrl, tenantB);

        expect(resultA).toContain(`portal.azure.com/${tenantA}/`);
        expect(resultB).toContain(`portal.azure.com/${tenantB}/`);
        expect(resultA).not.toEqual(resultB);
        // Both should keep #@domain
        expect(resultA).toContain('#@contoso.onmicrosoft.com');
        expect(resultB).toContain('#@contoso.onmicrosoft.com');
      });
    });

    describe('with domain tenant ID (fallback)', () => {
      it('should use #@domain format when tenant is not a GUID', () => {
        const urlWithoutDomain = 'https://portal.azure.com/#/resource/subscriptions/sub-123';
        const result = buildNavigationUrl(urlWithoutDomain, tenantDomain);
        expect(result).toContain(`#@${tenantDomain}`);
      });

      it('should not modify URL if #@ already present', () => {
        const result = buildNavigationUrl(baseUrl, tenantDomain);
        // baseUrl already has #@contoso.onmicrosoft.com
        expect(result).toBe(baseUrl);
      });
    });

    describe('edge cases', () => {
      it('should return original URL if tenantId is unknown', () => {
        const result = buildNavigationUrl(baseUrl, 'unknown');
        expect(result).toBe(baseUrl);
      });

      it('should return original URL if tenantId is empty', () => {
        const result = buildNavigationUrl(baseUrl, '');
        expect(result).toBe(baseUrl);
      });

      it('should handle URL without hash', () => {
        const simpleUrl = 'https://portal.azure.com/';
        const result = buildNavigationUrl(simpleUrl, tenantGuid);
        expect(result).toContain(`portal.azure.com/${tenantGuid}/`);
      });
    });

    // Critical test: Simulates the tenant switching scenario
    describe('multi-tenant switching scenario', () => {
      it('should produce different URLs for different tenants (GUID case)', () => {
        const tenantA_guid = '11111111-1111-1111-1111-111111111111';
        const tenantB_guid = '22222222-2222-2222-2222-222222222222';

        const resourceUrl = 'https://portal.azure.com/#@tenant.onmicrosoft.com/resource/subscriptions/sub-123';

        const navUrlA = buildNavigationUrl(resourceUrl, tenantA_guid);
        const navUrlB = buildNavigationUrl(resourceUrl, tenantB_guid);

        // Both should have GUID in path (required for directory switching)
        expect(navUrlA).toMatch(/portal\.azure\.com\/11111111-1111-1111-1111-111111111111\//);
        expect(navUrlB).toMatch(/portal\.azure\.com\/22222222-2222-2222-2222-222222222222\//);

        // Both should keep #@domain (required for resource navigation)
        expect(navUrlA).toContain('#@tenant.onmicrosoft.com');
        expect(navUrlB).toContain('#@tenant.onmicrosoft.com');

        // They should be different (different GUIDs)
        expect(navUrlA).not.toEqual(navUrlB);
      });

      it('should fail gracefully when only domain is available (known limitation)', () => {
        const domainA = 'tenantA.onmicrosoft.com';
        const domainB = 'tenantB.onmicrosoft.com';

        const resourceUrl = 'https://portal.azure.com/#/resource/subscriptions/sub-123';

        const navUrlA = buildNavigationUrl(resourceUrl, domainA);
        const navUrlB = buildNavigationUrl(resourceUrl, domainB);

        // Both use #@domain format (may not switch directories - known limitation)
        expect(navUrlA).toContain(`#@${domainA}`);
        expect(navUrlB).toContain(`#@${domainB}`);

        // They should be different URLs
        expect(navUrlA).not.toEqual(navUrlB);

        // But neither has GUID in path (will likely fail to switch)
        expect(navUrlA).not.toMatch(/portal\.azure\.com\/[a-f0-9-]{36}\//i);
        expect(navUrlB).not.toMatch(/portal\.azure\.com\/[a-f0-9-]{36}\//i);
      });
    });

    describe('GUID replacement for same-directory navigation', () => {
      it('should replace old GUID with new GUID when navigating within same directory', () => {
        const oldGuid = '11111111-1111-1111-1111-111111111111';
        const newGuid = '22222222-2222-2222-2222-222222222222';
        const urlWithOldGuid = `https://portal.azure.com/${oldGuid}/#@contoso.onmicrosoft.com/resource/subscriptions/sub-123`;

        const result = buildNavigationUrl(urlWithOldGuid, newGuid);

        // Should have new GUID in path
        expect(result).toContain(`portal.azure.com/${newGuid}/`);
        // Should NOT have old GUID
        expect(result).not.toContain(oldGuid);
        // Should preserve domain and resource path
        expect(result).toContain('#@contoso.onmicrosoft.com/resource/');
      });

      it('should handle URL with query params and replace GUID correctly', () => {
        const oldGuid = '11111111-1111-1111-1111-111111111111';
        const newGuid = '22222222-2222-2222-2222-222222222222';
        const urlWithParams = `https://portal.azure.com/${oldGuid}/?feature=test#@contoso.onmicrosoft.com/resource/subscriptions/sub-123`;

        const result = buildNavigationUrl(urlWithParams, newGuid);

        // Should replace GUID
        expect(result).toContain(`portal.azure.com/${newGuid}/`);
        expect(result).not.toContain(oldGuid);
        // Query params may or may not be preserved - that's OK
      });

      it('should work when URL has GUID in path but no #@domain', () => {
        const oldGuid = '11111111-1111-1111-1111-111111111111';
        const newGuid = '22222222-2222-2222-2222-222222222222';
        const urlWithoutDomain = `https://portal.azure.com/${oldGuid}/#/blade/HubsExtension/BrowseResource`;

        const result = buildNavigationUrl(urlWithoutDomain, newGuid);

        // Should replace GUID
        expect(result).toContain(`portal.azure.com/${newGuid}/`);
        expect(result).not.toContain(oldGuid);
        // Should preserve the blade path
        expect(result).toContain('#/blade/HubsExtension/BrowseResource');
      });

      it('should validate the complete format after GUID replacement', () => {
        const oldGuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
        const newGuid = '12345678-1234-5678-1234-567812345678';
        const url = `https://portal.azure.com/${oldGuid}/#@contoso.onmicrosoft.com/resource/subscriptions/sub-123/resourceGroups/rg-1/providers/Microsoft.Storage/storageAccounts/mystorage`;

        const result = buildNavigationUrl(url, newGuid);

        // Expected format: portal.azure.com/{GUID}/#@domain/resource/...
        const expectedPattern = new RegExp(`^https://portal\\.azure\\.com/${newGuid}/#@contoso\\.onmicrosoft\\.com/resource/`);
        expect(result).toMatch(expectedPattern);
      });
    });

    describe('Query parameter preservation', () => {
      it('should preserve language query parameters', () => {
        const guid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
        const url = 'https://portal.azure.com?l=en.en-us#@contoso.onmicrosoft.com/resource/subscriptions/sub-123';

        const result = buildNavigationUrl(url, guid);

        // Should preserve ?l=en.en-us
        expect(result).toContain('?l=en.en-us');
        expect(result).toContain(`portal.azure.com/${guid}/`);
        expect(result).toContain('#@contoso.onmicrosoft.com');
        expect(result).toBe(`https://portal.azure.com/${guid}/?l=en.en-us#@contoso.onmicrosoft.com/resource/subscriptions/sub-123`);
      });

      it('should preserve query params when replacing GUID', () => {
        const oldGuid = '11111111-1111-1111-1111-111111111111';
        const newGuid = '22222222-2222-2222-2222-222222222222';
        const url = `https://portal.azure.com/${oldGuid}?l=en.en-us#@contoso.onmicrosoft.com/resource/subscriptions/sub-123`;

        const result = buildNavigationUrl(url, newGuid);

        expect(result).toContain(`portal.azure.com/${newGuid}/`);
        expect(result).toContain('?l=en.en-us');
        expect(result).not.toContain(oldGuid);
      });

    });
  });

  describe('getTenantGuidFromPortal', () => {
    beforeEach(() => sessionStorage.clear());
    afterEach(() => sessionStorage.clear());

    it('should return GUID from sessionStorage MSAL token when URL has no GUID in path', () => {
      const guid = 'abcdef12-1234-1234-1234-123456789abc';
      // Build a minimal JWT with tid claim (header.payload.signature)
      const header = btoa('{"alg":"none"}');
      const payload = btoa(JSON.stringify({ tid: guid }));
      const fakeToken = `${header}.${payload}.fakesignature`;

      sessionStorage.setItem('msal.idtoken', fakeToken);

      const result = getTenantGuidFromPortal();

      expect(result).toBe(guid);
    });
  });

  describe('stripTenantGuidFromUrl', () => {
    it('removes GUID from portal URL path', () => {
      const guid = '12345678-1234-1234-1234-123456789abc';
      const url = `https://portal.azure.com/${guid}/#@contoso.onmicrosoft.com/resource/subscriptions/sub-123`;
      expect(stripTenantGuidFromUrl(url)).toBe(
        'https://portal.azure.com/#@contoso.onmicrosoft.com/resource/subscriptions/sub-123'
      );
    });

    it('leaves URL unchanged when no GUID in path', () => {
      const url = 'https://portal.azure.com/#@contoso.onmicrosoft.com/resource/subscriptions/sub-123';
      expect(stripTenantGuidFromUrl(url)).toBe(url);
    });

    it('preserves query params after stripping GUID', () => {
      const guid = '12345678-1234-1234-1234-123456789abc';
      const url = `https://portal.azure.com/${guid}/?l=en.en-us#@contoso.onmicrosoft.com/resource/subscriptions/sub-123`;
      expect(stripTenantGuidFromUrl(url)).toBe(
        'https://portal.azure.com/?l=en.en-us#@contoso.onmicrosoft.com/resource/subscriptions/sub-123'
      );
    });
  });
});
