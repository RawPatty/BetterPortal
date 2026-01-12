import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateDiff, formatValue, getDiffSummary } from './diff-calculator';
import type { Snapshot, DiffResult } from '../../shared/types';

// Mock settingsStore
vi.mock('../settings/settings.store', () => ({
  settingsStore: {
    get: vi.fn().mockResolvedValue({
      diffIgnoredPaths: ['etag', 'systemData'],
    }),
  },
}));

describe('diff-calculator', () => {
  const baseSnapshot: Snapshot = {
    id: 'snap-1',
    resourceId: '/subscriptions/sub-1/resourceGroups/rg-1/providers/Microsoft.Web/sites/app-1',
    tenantId: 'tenant-1',
    capturedAt: Date.now() - 1000,
    armState: {},
    iamAssignments: [],
    label: 'Before',
  };

  describe('calculateDiff', () => {
    it('should detect added properties', async () => {
      const snapshotA: Snapshot = {
        ...baseSnapshot,
        armState: { name: 'app-1' },
      };

      const snapshotB: Snapshot = {
        ...baseSnapshot,
        id: 'snap-2',
        armState: { name: 'app-1', location: 'eastus' },
        label: 'After',
      };

      const result = await calculateDiff(snapshotA, snapshotB);

      expect(result.armDiff).toHaveLength(1);
      expect(result.armDiff[0]).toEqual({
        path: 'location',
        type: 'added',
        newValue: 'eastus',
      });
    });

    it('should detect removed properties', async () => {
      const snapshotA: Snapshot = {
        ...baseSnapshot,
        armState: { name: 'app-1', location: 'eastus' },
      };

      const snapshotB: Snapshot = {
        ...baseSnapshot,
        id: 'snap-2',
        armState: { name: 'app-1' },
        label: 'After',
      };

      const result = await calculateDiff(snapshotA, snapshotB);

      expect(result.armDiff).toHaveLength(1);
      expect(result.armDiff[0]).toEqual({
        path: 'location',
        type: 'removed',
        oldValue: 'eastus',
      });
    });

    it('should detect changed properties', async () => {
      const snapshotA: Snapshot = {
        ...baseSnapshot,
        armState: { name: 'app-1', sku: 'Basic' },
      };

      const snapshotB: Snapshot = {
        ...baseSnapshot,
        id: 'snap-2',
        armState: { name: 'app-1', sku: 'Standard' },
        label: 'After',
      };

      const result = await calculateDiff(snapshotA, snapshotB);

      expect(result.armDiff).toHaveLength(1);
      expect(result.armDiff[0]).toEqual({
        path: 'sku',
        type: 'changed',
        oldValue: 'Basic',
        newValue: 'Standard',
      });
    });

    it('should detect nested property changes', async () => {
      const snapshotA: Snapshot = {
        ...baseSnapshot,
        armState: { properties: { setting: 'value1' } },
      };

      const snapshotB: Snapshot = {
        ...baseSnapshot,
        id: 'snap-2',
        armState: { properties: { setting: 'value2' } },
        label: 'After',
      };

      const result = await calculateDiff(snapshotA, snapshotB);

      expect(result.armDiff).toHaveLength(1);
      expect(result.armDiff[0].path).toBe('properties.setting');
    });

    it('should ignore configured paths', async () => {
      const snapshotA: Snapshot = {
        ...baseSnapshot,
        armState: { name: 'app-1', etag: 'etag-1' },
      };

      const snapshotB: Snapshot = {
        ...baseSnapshot,
        id: 'snap-2',
        armState: { name: 'app-1', etag: 'etag-2' },
        label: 'After',
      };

      const result = await calculateDiff(snapshotA, snapshotB);

      expect(result.armDiff).toHaveLength(0);
    });

    it('should detect IAM changes', async () => {
      const snapshotA: Snapshot = {
        ...baseSnapshot,
        iamAssignments: [
          { principalId: 'user-1', principalName: 'User 1', roleDefinitionId: 'role-1', roleName: 'Reader', scope: '/subscriptions/sub-1' },
        ],
      };

      const snapshotB: Snapshot = {
        ...baseSnapshot,
        id: 'snap-2',
        iamAssignments: [
          { principalId: 'user-1', principalName: 'User 1', roleDefinitionId: 'role-1', roleName: 'Reader', scope: '/subscriptions/sub-1' },
          { principalId: 'user-2', principalName: 'User 2', roleDefinitionId: 'role-2', roleName: 'Contributor', scope: '/subscriptions/sub-1' },
        ],
        label: 'After',
      };

      const result = await calculateDiff(snapshotA, snapshotB);

      expect(result.iamDiff.added).toHaveLength(1);
      expect(result.iamDiff.removed).toHaveLength(0);
      expect(result.iamDiff.unchanged).toBe(1);
    });
  });

  describe('formatValue', () => {
    it('should format null', () => {
      expect(formatValue(null)).toBe('null');
    });

    it('should format undefined', () => {
      expect(formatValue(undefined)).toBe('undefined');
    });

    it('should format strings with quotes', () => {
      expect(formatValue('hello')).toBe('"hello"');
    });

    it('should format numbers', () => {
      expect(formatValue(42)).toBe('42');
    });

    it('should format objects as JSON', () => {
      const result = formatValue({ key: 'value' });
      expect(result).toContain('"key"');
      expect(result).toContain('"value"');
    });
  });

  describe('getDiffSummary', () => {
    it('should return no changes message', () => {
      const result: DiffResult = {
        snapshotA: baseSnapshot,
        snapshotB: { ...baseSnapshot, id: 'snap-2' },
        armDiff: [],
        iamDiff: { added: [], removed: [], unchanged: 0 },
      };

      expect(getDiffSummary(result)).toBe('No changes detected');
    });

    it('should summarize property changes', () => {
      const result: DiffResult = {
        snapshotA: baseSnapshot,
        snapshotB: { ...baseSnapshot, id: 'snap-2' },
        armDiff: [
          { path: 'a', type: 'changed', oldValue: 1, newValue: 2 },
          { path: 'b', type: 'added', newValue: 3 },
        ],
        iamDiff: { added: [], removed: [], unchanged: 0 },
      };

      expect(getDiffSummary(result)).toBe('2 property changes');
    });

    it('should summarize IAM changes', () => {
      const result: DiffResult = {
        snapshotA: baseSnapshot,
        snapshotB: { ...baseSnapshot, id: 'snap-2' },
        armDiff: [],
        iamDiff: {
          added: [{ principalId: 'p1', principalName: 'User', roleDefinitionId: 'r1', roleName: 'Role', scope: 's' }],
          removed: [],
          unchanged: 0,
        },
      };

      expect(getDiffSummary(result)).toBe('1 role added');
    });
  });
});
