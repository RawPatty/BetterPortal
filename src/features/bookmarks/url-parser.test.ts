import { describe, it, expect } from 'vitest';
import {
  parsePortalUrl,
  isResourcePage,
  extractResourceName,
  extractResourceType,
  generateDisplayName,
  stripBlade,
  normalizePortalUrl,
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
});
