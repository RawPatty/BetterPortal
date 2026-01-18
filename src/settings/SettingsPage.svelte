<script lang="ts">
  import { onMount } from 'svelte';
  import type { Settings, HotkeyConfig } from '../shared/types';
  import { settingsStore } from '../features/settings/settings.store';
  import { DEFAULT_SETTINGS } from '../shared/types';
  import AboutModal from '../features/settings/AboutModal.svelte';

  let settings: Settings = { ...DEFAULT_SETTINGS };
  let isRecordingHotkey = false;
  let hotkeyError = '';
  let saveMessage = '';
  let showAbout = false;

  onMount(async () => {
    settings = await settingsStore.get();
  });

  function startHotkeyRecording() {
    isRecordingHotkey = true;
    hotkeyError = '';
  }

  function handleHotkeyKeydown(event: KeyboardEvent) {
    if (!isRecordingHotkey) return;

    event.preventDefault();

    if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
      return;
    }

    // Normalize spacebar key to match detection logic
    const normalizedKey = event.key === ' ' ? 'Space' : event.key;

    const newHotkey: HotkeyConfig = {
      key: normalizedKey,
      ctrl: event.ctrlKey,
      shift: event.shiftKey,
      alt: event.altKey,
      meta: event.metaKey,
    };

    settings.hotkey = newHotkey;
    isRecordingHotkey = false;
    hotkeyError = '';
    saveSettings();
  }

  function cancelHotkeyRecording() {
    isRecordingHotkey = false;
    hotkeyError = '';
  }

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

<div class="bp-settings-page bp-theme-{settings.theme || 'light'}">
  <div class="bp-settings-panel">
    <header class="bp-settings-header">
      <h2>BetterPortal Settings</h2>
      {#if saveMessage}
        <span class="bp-save-message">{saveMessage}</span>
      {/if}
    </header>

    <div class="bp-settings-content">
      <!-- Hotkey Section -->
      <section class="bp-settings-section">
        <h3>Keyboard Shortcut</h3>
        <div class="bp-settings-row">
          <label>Open Overlay</label>
          <div class="bp-hotkey-input">
            {#if isRecordingHotkey}
              <input
                type="text"
                class="bp-hotkey-recorder"
                placeholder="Press new shortcut..."
                on:keydown={handleHotkeyKeydown}
                on:blur={cancelHotkeyRecording}
                autofocus
                readonly
              />
              <button class="bp-btn-small" on:click={cancelHotkeyRecording}>Cancel</button>
            {:else}
              <kbd class="bp-hotkey-display">{formatHotkey(settings.hotkey)}</kbd>
              <button class="bp-btn-small" on:click={startHotkeyRecording}>Change</button>
            {/if}
          </div>
          {#if hotkeyError}
            <div class="bp-error">{hotkeyError}</div>
          {/if}
        </div>
      </section>

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
        <div class="bp-settings-row">
          <label>
            <input type="checkbox" bind:checked={settings.showStaleIndicator} on:change={saveSettings} />
            Show stale resource indicator
          </label>
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
          <label>
            <input type="checkbox" bind:checked={settings.autoBookmark} on:change={saveSettings} />
            Auto-bookmark visited pages
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

      <!-- Diff Section -->
      <section class="bp-settings-section">
        <h3>Diff / Snapshots</h3>
        <div class="bp-settings-row">
          <label for="maxSnapshots">Max snapshots per resource</label>
          <input
            id="maxSnapshots"
            type="number"
            min="2"
            max="20"
            bind:value={settings.maxSnapshotsPerResource}
            on:change={saveSettings}
          />
        </div>
        <div class="bp-settings-row">
          <label for="ignoredPaths">Ignored paths (comma-separated)</label>
          <input
            id="ignoredPaths"
            type="text"
            value={settings.diffIgnoredPaths.join(', ')}
            on:change={(e) => {
              settings.diffIgnoredPaths = e.currentTarget.value.split(',').map(s => s.trim()).filter(Boolean);
              saveSettings();
            }}
          />
        </div>
      </section>
    </div>

    <footer class="bp-settings-footer">
      <div class="bp-settings-footer-left">
        <button class="bp-btn bp-btn--secondary" on:click={() => showAbout = true}>About</button>
      </div>
      <div class="bp-settings-footer-right">
        <button class="bp-btn bp-btn--secondary" on:click={resetSettings}>Reset to Defaults</button>
      </div>
    </footer>
  </div>
</div>

<AboutModal isOpen={showAbout} on:close={() => showAbout = false} />

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

  .bp-settings-row label {
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

  .bp-hotkey-input {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .bp-hotkey-display {
    display: inline-block;
    padding: 6px 12px;
    font-family: monospace;
    font-size: 13px;
    background: var(--bp-bg-secondary, #f5f5f5);
    border: 1px solid var(--bp-border, #e1e1e1);
    border-radius: 4px;
    color: var(--bp-text, #323130);
  }

  .bp-hotkey-recorder {
    padding: 6px 12px;
    font-size: 14px;
    border: 2px solid var(--bp-accent, #0078d4);
    border-radius: 4px;
    outline: none;
    width: 180px;
    background: var(--bp-bg, #fff);
    color: var(--bp-text, #323130);
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

  .bp-error {
    color: var(--bp-error, #d13438);
    font-size: 12px;
    margin-top: 4px;
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
