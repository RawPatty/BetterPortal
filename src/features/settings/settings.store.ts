// Settings store for BetterPortal
import { storageGet, storageSet } from '../../shared/storage';
import { DEFAULT_SETTINGS, type Settings } from '../../shared/types';

export const settingsStore = {
  /**
   * Get current settings (with defaults for missing fields)
   */
  async get(): Promise<Settings> {
    const stored = await storageGet('settings');
    if (!stored) {
      return { ...DEFAULT_SETTINGS };
    }
    // Merge with defaults to handle new fields
    return { ...DEFAULT_SETTINGS, ...stored };
  },

  /**
   * Update settings (partial update)
   */
  async update(partial: Partial<Settings>): Promise<Settings> {
    const current = await this.get();
    const updated = { ...current, ...partial };
    await storageSet('settings', updated);
    return updated;
  },

  /**
   * Reset settings to defaults
   */
  async reset(): Promise<Settings> {
    await storageSet('settings', DEFAULT_SETTINGS);
    return { ...DEFAULT_SETTINGS };
  },

  /**
   * Check if a hotkey matches the configured hotkey
   */
  async matchesHotkey(event: KeyboardEvent): Promise<boolean> {
    const settings = await this.get();
    const { hotkey } = settings;

    return (
      event.key === hotkey.key &&
      event.ctrlKey === hotkey.ctrl &&
      event.shiftKey === hotkey.shift &&
      event.altKey === hotkey.alt
    );
  },

  /**
   * Get hotkey display string
   */
  async getHotkeyDisplay(): Promise<string> {
    const settings = await this.get();
    const { hotkey } = settings;
    const parts: string[] = [];

    if (hotkey.ctrl) parts.push('Ctrl');
    if (hotkey.shift) parts.push('Shift');
    if (hotkey.alt) parts.push('Alt');
    parts.push(hotkey.key);

    return parts.join('+');
  },
};
