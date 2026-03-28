<script lang="ts">
  import { onMount } from 'svelte';
  import type { Settings } from '../shared/types';
  import { settingsStore } from '../features/settings/settings.store';
  import { DEFAULT_SETTINGS } from '../shared/types';
  import AboutModal from '../features/settings/AboutModal.svelte';
  import KeybindsModal from '../features/settings/KeybindsModal.svelte';

  let settings: Settings = { ...DEFAULT_SETTINGS };
  let saveMessage = '';
  let showAbout = false;
  let showKeybinds = false;

  onMount(async () => {
    settings = await settingsStore.get();
  });

  async function saveSettings() {
    await settingsStore.update(settings);
    showSaveMessage();
  }

  function showSaveMessage() {
    saveMessage = 'Settings saved';
    setTimeout(() => {
      saveMessage = '';
    }, 2000);
  }

  function formatHotkey(hotkey: HotkeyConfig): string {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const parts: string[] = [];
    if (hotkey.ctrl) parts.push('Ctrl');
    if (hotkey.shift) parts.push('Shift');
    if (hotkey.alt) parts.push('Alt');
    if (hotkey.meta) parts.push(isMac ? '⌘' : 'Meta');
    parts.push(hotkey.key);
    return parts.join('+');
  }

  async function resetSettings() {
    if (confirm('Reset all settings to defaults?')) {
      settings = await settingsStore.reset();
      showSaveMessage();
    }
  }
</script>

<div class="bp-settings-page bp-theme-{settings.theme || 'dark'}">
  <div class="bp-settings-panel">
    <header class="bp-settings-header">
      <h2>BetterPortal Settings</h2>
      {#if saveMessage}
        <span class="bp-save-message">{saveMessage}</span>
      {/if}
    </header>

    <div class="bp-settings-content">
      <!-- Display Section -->
      <section class="bp-settings-section">
        <h3>Display</h3>
        <div class="bp-settings-row">
          <label for="theme">Theme</label>
          <select id="theme" bind:value={settings.theme} on:change={saveSettings}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <div class="bp-settings-row">
          <label for="stateDepth">Default Bookmark Depth</label>
          <select id="stateDepth" bind:value={settings.defaultStateDepth} on:change={saveSettings}>
            <option value="full">Full (include blade)</option>
            <option value="resource">Resource only</option>
          </select>
        </div>
      </section>

      <!-- History Section -->
      <section class="bp-settings-section">
        <h3>History & Bookmarks</h3>
        <div class="bp-settings-row">
          <label>
            <input type="checkbox" bind:checked={settings.historyEnabled} on:change={saveSettings} />
            Enable history tracking
          </label>
        </div>
        <div class="bp-settings-row">
          <label for="retention">Retention (days)</label>
          <input
            id="retention"
            type="number"
            min="1"
            max="365"
            bind:value={settings.historyRetentionDays}
            on:change={saveSettings}
          />
        </div>
        <div class="bp-settings-row">
          <label for="maxEntries">Max entries</label>
          <input
            id="maxEntries"
            type="number"
            min="10"
            max="1000"
            bind:value={settings.historyMaxEntries}
            on:change={saveSettings}
          />
        </div>
      </section>

    </div>

    <footer class="bp-settings-footer">
      <div class="bp-settings-footer-left">
        <button class="bp-btn bp-btn--secondary" on:click={() => showAbout = true}>About</button>
        <button class="bp-btn bp-btn--secondary" on:click={() => showKeybinds = true}>Keybinds</button>
      </div>
      <div class="bp-settings-footer-right">
        <button class="bp-btn bp-btn--secondary" on:click={resetSettings}>Reset to Defaults</button>
      </div>
    </footer>
  </div>
</div>

<AboutModal isOpen={showAbout} on:close={() => showAbout = false} />
<KeybindsModal isOpen={showKeybinds} on:close={() => showKeybinds = false} on:settingsChanged={saveSettings} />

<style>
  @import '../shared/theme.css';

  .bp-settings-page {
    width: 100%;
    max-width: 600px;
    padding: 20px;
  }

  .bp-settings-panel {
    background: var(--bp-bg, #fff);
    border-radius: 8px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }

  .bp-settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--bp-border, #e1e1e1);
    background: var(--bp-accent, #0078d4);
    color: white;
  }

  .bp-settings-header h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }

  .bp-save-message {
    font-size: 13px;
    background: rgba(255, 255, 255, 0.2);
    padding: 4px 12px;
    border-radius: 4px;
  }

  .bp-settings-content {
    padding: 20px;
  }

  .bp-settings-section {
    margin-bottom: 24px;
  }

  .bp-settings-section:last-child {
    margin-bottom: 0;
  }

  .bp-settings-section h3 {
    margin: 0 0 12px 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--bp-accent, #0078d4);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .bp-settings-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    gap: 12px;
  }

  .bp-settings-row label,
  .bp-settings-row .bp-label {
    font-size: 14px;
    color: var(--bp-text, #323130);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .bp-settings-row select,
  .bp-settings-row input[type="number"],
  .bp-settings-row input[type="text"] {
    padding: 6px 10px;
    border: 1px solid var(--bp-border, #e1e1e1);
    border-radius: 4px;
    font-size: 14px;
    min-width: 120px;
    background: var(--bp-bg, #fff);
    color: var(--bp-text, #323130);
  }

  .bp-settings-row input[type="checkbox"] {
    width: 16px;
    height: 16px;
  }

  .bp-btn-small {
    padding: 4px 10px;
    font-size: 12px;
    background: var(--bp-bg-secondary, #f5f5f5);
    border: 1px solid var(--bp-border, #e1e1e1);
    border-radius: 4px;
    cursor: pointer;
    color: var(--bp-text, #323130);
  }

  .bp-btn-small:hover {
    background: var(--bp-border, #e1e1e1);
  }

  .bp-settings-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 20px;
    border-top: 1px solid var(--bp-border, #e1e1e1);
    background: var(--bp-bg-secondary, #f8f8f8);
  }

  .bp-settings-footer-left {
    display: flex;
    gap: 8px;
  }

  .bp-settings-footer-right {
    display: flex;
    gap: 8px;
  }

  .bp-btn {
    padding: 8px 16px;
    font-size: 14px;
    font-weight: 500;
    border-radius: 4px;
    cursor: pointer;
    border: none;
  }

  .bp-btn--secondary {
    background: var(--bp-bg, #fff);
    color: var(--bp-text, #323130);
    border: 1px solid var(--bp-border, #e1e1e1);
  }

  .bp-btn--secondary:hover {
    background: var(--bp-bg-secondary, #f5f5f5);
  }
</style>
