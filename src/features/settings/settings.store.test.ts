import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_SETTINGS } from '../../shared/types';

// Mock the storage module directly — avoids needing a full chrome.storage callback mock
vi.mock('../../shared/storage', () => ({
  storageSyncGet: vi.fn(),
  storageSyncSet: vi.fn().mockResolvedValue(undefined),
}));

import { settingsStore } from './settings.store';
import { storageSyncGet } from '../../shared/storage';

describe('settingsStore.get()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns yank/openNewTab defaults when nothing is stored', async () => {
    vi.mocked(storageSyncGet).mockResolvedValue(null);
    const settings = await settingsStore.get();
    expect(settings.overlayKeybinds.yank).toEqual(DEFAULT_SETTINGS.overlayKeybinds.yank);
    expect(settings.overlayKeybinds.openNewTab).toEqual(DEFAULT_SETTINGS.overlayKeybinds.openNewTab);
  });

  it('back-fills yank/openNewTab for users with pre-1.1.0 stored settings', async () => {
    // Simulate a user whose stored settings predate yank/openNewTab
    const oldSettings = {
      ...DEFAULT_SETTINGS,
      overlayKeybinds: {
        navDown:  { key: 'j', ctrl: false, shift: false, alt: false, meta: false },
        navUp:    { key: 'k', ctrl: false, shift: false, alt: false, meta: false },
        search:   { key: '/', ctrl: false, shift: false, alt: false, meta: false },
        add:      { key: 'a', ctrl: false, shift: false, alt: false, meta: false },
        delete:   { key: 'd', ctrl: false, shift: false, alt: false, meta: false },
        edit:     { key: 'e', ctrl: false, shift: false, alt: false, meta: false },
        settings: { key: '?', ctrl: false, shift: true,  alt: false, meta: false },
        // yank and openNewTab intentionally absent
      },
    };
    vi.mocked(storageSyncGet).mockResolvedValue(oldSettings as any);
    const result = await settingsStore.get();
    // New fields should fall back to defaults
    expect(result.overlayKeybinds.yank).toEqual(DEFAULT_SETTINGS.overlayKeybinds.yank);
    expect(result.overlayKeybinds.openNewTab).toEqual(DEFAULT_SETTINGS.overlayKeybinds.openNewTab);
    // Existing bindings should be preserved
    expect(result.overlayKeybinds.navDown).toEqual({ key: 'j', ctrl: false, shift: false, alt: false, meta: false });
  });

  it('preserves user-customised yank binding when already stored', async () => {
    const customSettings = {
      ...DEFAULT_SETTINGS,
      overlayKeybinds: {
        ...DEFAULT_SETTINGS.overlayKeybinds,
        yank: { key: 'c', ctrl: true, shift: false, alt: false, meta: false },
      },
    };
    vi.mocked(storageSyncGet).mockResolvedValue(customSettings);
    const result = await settingsStore.get();
    expect(result.overlayKeybinds.yank).toEqual({ key: 'c', ctrl: true, shift: false, alt: false, meta: false });
  });
});
