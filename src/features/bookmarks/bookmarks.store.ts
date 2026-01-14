// Bookmarks store for BetterPortal
import { storageGet, storageSet } from '../../shared/storage';
import type { Bookmark, Settings } from '../../shared/types';
import {
  parsePortalUrl,
  generateDisplayName,
  getTenantNameFromDOM,
  getResourceNameFromDOM,
  extractResourceName,
  isSubscriptionResource,
  stripBlade,
} from './url-parser';
import { settingsStore } from '../settings/settings.store';

export const bookmarkStore = {
  /**
   * Get all bookmarks
   */
  async getAll(): Promise<Bookmark[]> {
    const bookmarks = await storageGet('bookmarks');
    return bookmarks || [];
  },

  /**
   * Get bookmarks for a specific tenant
   */
  async getByTenant(tenantId: string): Promise<Bookmark[]> {
    const all = await this.getAll();
    return all.filter((b) => b.tenantId === tenantId);
  },

  /**
   * Get a bookmark by ID
   */
  async get(id: string): Promise<Bookmark | null> {
    const all = await this.getAll();
    return all.find((b) => b.id === id) || null;
  },

  /**
   * Get bookmarks grouped by tenant
   */
  async getGroupedByTenant(): Promise<Map<string, Bookmark[]>> {
    const all = await this.getAll();
    const grouped = new Map<string, Bookmark[]>();

    for (const bookmark of all) {
      const key = bookmark.tenantId;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(bookmark);
    }

    // Sort bookmarks within each tenant by accessCount (most used first)
    for (const [, bookmarks] of grouped) {
      bookmarks.sort((a, b) => b.accessCount - a.accessCount);
    }

    return grouped;
  },

  /**
   * Save a new bookmark from the current page
   */
  async saveCurrentPage(options?: {
    alias?: string;
    stateDepth?: 'full' | 'resource';
  }): Promise<Bookmark> {
    const url = window.location.href;
    const parsed = parsePortalUrl(url);
    const settings = await settingsStore.get();

    // Determine final URL based on state depth
    const stateDepth = options?.stateDepth || settings.defaultStateDepth;
    const finalUrl = stateDepth === 'resource' ? stripBlade(url) : url;

    // Get resource name from URL - this is always accurate
    const urlResourceName = parsed.resourceId ? extractResourceName(parsed.resourceId) : 'Unknown';

    // Get DOM name for potential friendly formatting
    const domName = getResourceNameFromDOM();

    // Use URL-extracted name as primary (always correct)
    // Only use DOM name if it contains the URL resource name
    let displayName: string;
    if (domName && domName.toLowerCase().includes(urlResourceName.toLowerCase())) {
      displayName = domName;
      console.log('[BetterPortal] Bookmark using DOM name (matches URL):', domName);
    } else {
      displayName = urlResourceName;
      console.log('[BetterPortal] Bookmark using URL resource name:', urlResourceName, '(DOM was:', domName, ')');
    }

    const bookmark: Bookmark = {
      id: crypto.randomUUID(),
      url: finalUrl,
      tenantId: parsed.tenantId || 'unknown',
      tenantName: getTenantNameFromDOM() || parsed.tenantDomain || 'Unknown Tenant',
      resourceId: parsed.resourceId || '',
      displayName,
      alias: options?.alias || null,
      stateDepth,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 0,
      isStale: false,
    };

    // Check for existing bookmark with same resource+tenant
    const all = await this.getAll();
    const existingIndex = all.findIndex(
      (b) => b.resourceId === bookmark.resourceId && b.tenantId === bookmark.tenantId
    );

    if (existingIndex >= 0) {
      // Update existing bookmark
      all[existingIndex] = {
        ...all[existingIndex],
        url: bookmark.url,
        displayName: bookmark.displayName,
        stateDepth: bookmark.stateDepth,
        alias: bookmark.alias ?? all[existingIndex].alias,
      };
      await storageSet('bookmarks', all);
      return all[existingIndex];
    }

    // Add new bookmark
    all.push(bookmark);
    await storageSet('bookmarks', all);
    return bookmark;
  },

  /**
   * Save a bookmark directly
   */
  async save(bookmark: Bookmark): Promise<void> {
    const all = await this.getAll();
    const existingIndex = all.findIndex((b) => b.id === bookmark.id);

    if (existingIndex >= 0) {
      all[existingIndex] = bookmark;
    } else {
      all.push(bookmark);
    }

    await storageSet('bookmarks', all);
  },

  /**
   * Update a bookmark
   */
  async update(id: string, partial: Partial<Bookmark>): Promise<Bookmark | null> {
    const all = await this.getAll();
    const index = all.findIndex((b) => b.id === id);

    if (index < 0) {
      return null;
    }

    all[index] = { ...all[index], ...partial };
    await storageSet('bookmarks', all);
    return all[index];
  },

  /**
   * Delete a bookmark
   */
  async delete(id: string): Promise<boolean> {
    const all = await this.getAll();
    const filtered = all.filter((b) => b.id !== id);

    if (filtered.length === all.length) {
      return false;
    }

    await storageSet('bookmarks', filtered);
    return true;
  },

  /**
   * Navigate to a bookmark
   */
  async navigate(id: string): Promise<void> {
    const bookmark = await this.get(id);
    if (!bookmark) {
      console.error('[BetterPortal] Bookmark not found:', id);
      return;
    }

    // Update access stats
    await this.update(id, {
      lastAccessed: Date.now(),
      accessCount: bookmark.accessCount + 1,
    });

    // Navigate
    window.location.href = bookmark.url;
  },

  /**
   * Mark a bookmark as stale
   */
  async markStale(id: string, isStale: boolean): Promise<void> {
    await this.update(id, { isStale });
  },

  /**
   * Export bookmarks as JSON
   */
  async export(): Promise<string> {
    const bookmarks = await this.getAll();
    return JSON.stringify(bookmarks, null, 2);
  },

  /**
   * Import bookmarks from JSON
   */
  async import(json: string): Promise<{ added: number; skipped: number }> {
    const imported = JSON.parse(json) as Bookmark[];
    const existing = await this.getAll();

    const existingKeys = new Set(
      existing.map((b) => `${b.resourceId}:${b.tenantId}`)
    );

    let added = 0;
    let skipped = 0;

    for (const bookmark of imported) {
      const key = `${bookmark.resourceId}:${bookmark.tenantId}`;
      if (existingKeys.has(key)) {
        skipped++;
      } else {
        existing.push({
          ...bookmark,
          id: crypto.randomUUID(), // Generate new ID
        });
        existingKeys.add(key);
        added++;
      }
    }

    await storageSet('bookmarks', existing);
    return { added, skipped };
  },

  /**
   * Search bookmarks
   */
  async search(query: string): Promise<Bookmark[]> {
    if (!query.trim()) {
      return this.getAll();
    }

    const all = await this.getAll();
    const lowerQuery = query.toLowerCase();

    return all.filter((bookmark) => {
      const searchText = [
        bookmark.displayName,
        bookmark.alias,
        bookmark.tenantName,
        bookmark.resourceId,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchText.includes(lowerQuery);
    });
  },
};
