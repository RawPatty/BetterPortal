// Snapshot store for resource state tracking
import { storageGet, storageSet } from '../../shared/storage';
import type { Snapshot, RoleAssignment } from '../../shared/types';
import { getResourceState, getRoleAssignments } from './arm-client';
import { settingsStore } from '../settings/settings.store';
import { MAX_ITEMS } from '../../shared/constants';

export const snapshotStore = {
  /**
   * Get all snapshots
   */
  async getAll(): Promise<Snapshot[]> {
    const snapshots = await storageGet('snapshots');
    return snapshots || [];
  },

  /**
   * Get snapshots for a specific resource
   */
  async getByResource(resourceId: string): Promise<Snapshot[]> {
    const all = await this.getAll();
    return all
      .filter((s) => s.resourceId === resourceId)
      .sort((a, b) => b.capturedAt - a.capturedAt);
  },

  /**
   * Get a snapshot by ID
   */
  async get(id: string): Promise<Snapshot | null> {
    const all = await this.getAll();
    return all.find((s) => s.id === id) || null;
  },

  /**
   * Capture a new snapshot for a resource
   */
  async capture(
    resourceId: string,
    tenantId: string,
    label?: string
  ): Promise<Snapshot | { error: string }> {
    // Fetch resource state from ARM
    const [stateResponse, iamResponse] = await Promise.all([
      getResourceState(resourceId),
      getRoleAssignments(resourceId),
    ]);

    if (!stateResponse.success) {
      return { error: stateResponse.error || 'Failed to fetch resource state' };
    }

    const snapshot: Snapshot = {
      id: crypto.randomUUID(),
      resourceId,
      tenantId,
      capturedAt: Date.now(),
      armState: stateResponse.data || {},
      iamAssignments: iamResponse.success ? (iamResponse.data || []) : [],
      label: label || `Snapshot ${new Date().toLocaleString()}`,
    };

    // Save and prune
    const all = await this.getAll();
    all.push(snapshot);

    // Prune old snapshots for this resource
    const settings = await settingsStore.get();
    const maxPerResource = settings.maxSnapshotsPerResource || MAX_ITEMS.SNAPSHOTS_PER_RESOURCE;

    const resourceSnapshots = all
      .filter((s) => s.resourceId === resourceId)
      .sort((a, b) => b.capturedAt - a.capturedAt);

    if (resourceSnapshots.length > maxPerResource) {
      const toRemove = resourceSnapshots.slice(maxPerResource).map((s) => s.id);
      const pruned = all.filter((s) => !toRemove.includes(s.id));
      await storageSet('snapshots', pruned);
    } else {
      await storageSet('snapshots', all);
    }

    console.log('[BetterPortal] Snapshot captured:', snapshot.label);
    return snapshot;
  },

  /**
   * Delete a snapshot
   */
  async delete(id: string): Promise<boolean> {
    const all = await this.getAll();
    const filtered = all.filter((s) => s.id !== id);

    if (filtered.length === all.length) {
      return false;
    }

    await storageSet('snapshots', filtered);
    return true;
  },

  /**
   * Delete all snapshots for a resource
   */
  async deleteByResource(resourceId: string): Promise<number> {
    const all = await this.getAll();
    const filtered = all.filter((s) => s.resourceId !== resourceId);
    const deleted = all.length - filtered.length;

    await storageSet('snapshots', filtered);
    return deleted;
  },

  /**
   * Clear all snapshots
   */
  async clear(): Promise<void> {
    await storageSet('snapshots', []);
  },

  /**
   * Update snapshot label
   */
  async updateLabel(id: string, label: string): Promise<boolean> {
    const all = await this.getAll();
    const index = all.findIndex((s) => s.id === id);

    if (index < 0) {
      return false;
    }

    all[index] = { ...all[index], label };
    await storageSet('snapshots', all);
    return true;
  },

  /**
   * Get the two most recent snapshots for comparison
   */
  async getLatestPair(resourceId: string): Promise<[Snapshot, Snapshot] | null> {
    const snapshots = await this.getByResource(resourceId);

    if (snapshots.length < 2) {
      return null;
    }

    return [snapshots[1], snapshots[0]]; // [older, newer]
  },
};
