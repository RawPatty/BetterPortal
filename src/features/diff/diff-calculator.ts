// Diff Calculator for comparing resource snapshots
import type { Snapshot, PropertyDiff, DiffResult, RoleAssignment } from '../../shared/types';
import { DEFAULT_IGNORED_PATHS } from '../../shared/constants';
import { settingsStore } from '../settings/settings.store';

/**
 * Calculate diff between two snapshots
 */
export async function calculateDiff(
  snapshotA: Snapshot,
  snapshotB: Snapshot
): Promise<DiffResult> {
  const settings = await settingsStore.get();
  const ignoredPaths = settings.diffIgnoredPaths || DEFAULT_IGNORED_PATHS;

  // Calculate ARM property diff
  const armDiff = diffObjects(snapshotA.armState, snapshotB.armState, '', ignoredPaths);

  // Calculate IAM diff
  const iamDiff = diffIamAssignments(snapshotA.iamAssignments, snapshotB.iamAssignments);

  return {
    snapshotA,
    snapshotB,
    armDiff,
    iamDiff,
  };
}

/**
 * Deep diff two objects, returning property differences
 */
function diffObjects(
  objA: Record<string, unknown>,
  objB: Record<string, unknown>,
  basePath: string = '',
  ignoredPaths: string[]
): PropertyDiff[] {
  const diffs: PropertyDiff[] = [];

  // Get all keys from both objects
  const allKeys = new Set([...Object.keys(objA || {}), ...Object.keys(objB || {})]);

  for (const key of allKeys) {
    const path = basePath ? `${basePath}.${key}` : key;

    // Skip ignored paths
    if (shouldIgnorePath(path, ignoredPaths)) {
      continue;
    }

    const valueA = objA?.[key];
    const valueB = objB?.[key];

    // Handle undefined/missing values
    if (valueA === undefined && valueB !== undefined) {
      diffs.push({
        path,
        type: 'added',
        newValue: valueB,
      });
      continue;
    }

    if (valueA !== undefined && valueB === undefined) {
      diffs.push({
        path,
        type: 'removed',
        oldValue: valueA,
      });
      continue;
    }

    // Handle arrays
    if (Array.isArray(valueA) && Array.isArray(valueB)) {
      const arrayDiffs = diffArrays(valueA, valueB, path, ignoredPaths);
      diffs.push(...arrayDiffs);
      continue;
    }

    // Handle nested objects
    if (isObject(valueA) && isObject(valueB)) {
      const nestedDiffs = diffObjects(
        valueA as Record<string, unknown>,
        valueB as Record<string, unknown>,
        path,
        ignoredPaths
      );
      diffs.push(...nestedDiffs);
      continue;
    }

    // Handle primitive values
    if (!deepEqual(valueA, valueB)) {
      diffs.push({
        path,
        type: 'changed',
        oldValue: valueA,
        newValue: valueB,
      });
    }
  }

  return diffs;
}

/**
 * Diff two arrays
 */
function diffArrays(
  arrA: unknown[],
  arrB: unknown[],
  basePath: string,
  ignoredPaths: string[]
): PropertyDiff[] {
  const diffs: PropertyDiff[] = [];

  // Simple length comparison for now
  if (arrA.length !== arrB.length) {
    diffs.push({
      path: `${basePath}.length`,
      type: 'changed',
      oldValue: arrA.length,
      newValue: arrB.length,
    });
  }

  // Compare elements by index
  const maxLen = Math.max(arrA.length, arrB.length);
  for (let i = 0; i < maxLen; i++) {
    const path = `${basePath}[${i}]`;

    if (i >= arrA.length) {
      diffs.push({
        path,
        type: 'added',
        newValue: arrB[i],
      });
      continue;
    }

    if (i >= arrB.length) {
      diffs.push({
        path,
        type: 'removed',
        oldValue: arrA[i],
      });
      continue;
    }

    const elemA = arrA[i];
    const elemB = arrB[i];

    if (isObject(elemA) && isObject(elemB)) {
      const nestedDiffs = diffObjects(
        elemA as Record<string, unknown>,
        elemB as Record<string, unknown>,
        path,
        ignoredPaths
      );
      diffs.push(...nestedDiffs);
    } else if (!deepEqual(elemA, elemB)) {
      diffs.push({
        path,
        type: 'changed',
        oldValue: elemA,
        newValue: elemB,
      });
    }
  }

  return diffs;
}

/**
 * Diff IAM role assignments
 */
function diffIamAssignments(
  assignmentsA: RoleAssignment[],
  assignmentsB: RoleAssignment[]
): { added: RoleAssignment[]; removed: RoleAssignment[]; unchanged: number } {
  const keyA = new Set(assignmentsA.map(getAssignmentKey));
  const keyB = new Set(assignmentsB.map(getAssignmentKey));

  const added = assignmentsB.filter((a) => !keyA.has(getAssignmentKey(a)));
  const removed = assignmentsA.filter((a) => !keyB.has(getAssignmentKey(a)));
  const unchanged = assignmentsA.filter((a) => keyB.has(getAssignmentKey(a))).length;

  return { added, removed, unchanged };
}

/**
 * Generate a unique key for a role assignment
 */
function getAssignmentKey(assignment: RoleAssignment): string {
  return `${assignment.principalId}|${assignment.roleDefinitionId}|${assignment.scope}`;
}

/**
 * Check if a path should be ignored
 */
function shouldIgnorePath(path: string, ignoredPaths: string[]): boolean {
  for (const ignored of ignoredPaths) {
    // Exact match
    if (path === ignored) return true;

    // Prefix match (e.g., "systemData" matches "systemData.createdAt")
    if (path.startsWith(`${ignored}.`)) return true;

    // Suffix match (e.g., "etag" matches "properties.etag")
    if (path.endsWith(`.${ignored}`)) return true;

    // Contains match
    if (path.includes(`.${ignored}.`)) return true;
  }
  return false;
}

/**
 * Check if value is a plain object
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep equality check
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;

  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, i) => deepEqual(val, b[i]));
  }

  if (isObject(a) && isObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) => deepEqual(a[key], b[key]));
  }

  return false;
}

/**
 * Format a value for display
 */
export function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return '[Object]';
    }
  }
  return String(value);
}

/**
 * Get a summary of the diff
 */
export function getDiffSummary(diff: DiffResult): string {
  const armChanges = diff.armDiff.length;
  const iamAdded = diff.iamDiff.added.length;
  const iamRemoved = diff.iamDiff.removed.length;

  const parts: string[] = [];

  if (armChanges > 0) {
    parts.push(`${armChanges} property change${armChanges > 1 ? 's' : ''}`);
  }

  if (iamAdded > 0) {
    parts.push(`${iamAdded} role${iamAdded > 1 ? 's' : ''} added`);
  }

  if (iamRemoved > 0) {
    parts.push(`${iamRemoved} role${iamRemoved > 1 ? 's' : ''} removed`);
  }

  if (parts.length === 0) {
    return 'No changes detected';
  }

  return parts.join(', ');
}
