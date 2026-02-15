<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { Settings, HotkeyConfig } from '../../shared/types';
  import { settingsStore } from './settings.store';
  import { DEFAULT_SETTINGS } from '../../shared/types';
  import AboutModal from './AboutModal.svelte';

  export let isOpen: boolean = false;

  const dispatch = createEventDispatcher();

  let settings: Settings = { ...DEFAULT_SETTINGS };
  let isRecordingHotkey = false;
  let hotkeyError = '';
  let showAbout = false;

  onMount(async () => {
    settings = await settingsStore.get();
  });

  function close() {
    dispatch('close');
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && !isRecordingHotkey) {
      close();
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      close();
    }
  }

  function startHotkeyRecording() {
    isRecordingHotkey = true;
    hotkeyError = '';
  }

  function handleHotkeyKeydown(event: KeyboardEvent) {
    if (!isRecordingHotkey) return;

    event.preventDefault();

    // Ignore modifier-only keys
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
    dispatch('settingsChanged', settings);
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

  async function handleThemeChange() {
    await saveSettings();
  }

  async function handleHistoryToggle() {
    await saveSettings();
  }

  async function handleRetentionChange() {
    await saveSettings();
  }

  async function handleStateDepthChange() {
    await saveSettings();
  }

  async function resetSettings() {
    if (confirm('Reset all settings to defaults?')) {
      settings = await settingsStore.reset();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="bp-settings-modal bp-theme-{settings.theme || 'light'}" on:click={handleBackdropClick}>
    <div class="bp-settings-panel" role="dialog" aria-modal="true" aria-label="Settings">
      <header class="bp-settings-header">
        <h2>Settings</h2>
        <button class="bp-settings-close" on:click={close} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </header>

      <div class="bp-settings-content">
        <!-- Hotkey Section -->
        <section class="bp-settings-section">
          <h3>Keyboard Shortcut</h3>
          <div class="bp-settings-row">
            <span class="bp-label">Open Overlay</span>
            <div class="bp-hotkey-input">
              {#if isRecordingHotkey}
                <!-- svelte-ignore a11y-autofocus -->
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
            <select id="theme" bind:value={settings.theme} on:change={handleThemeChange}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
          <div class="bp-settings-row">
            <label for="stateDepth">Default Bookmark Depth</label>
            <select id="stateDepth" bind:value={settings.defaultStateDepth} on:change={handleStateDepthChange}>
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
              <input type="checkbox" bind:checked={settings.historyEnabled} on:change={handleHistoryToggle} />
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
              on:change={handleRetentionChange}
            />
          </div>
          <div class="bp-settings-row">
            <label for="maxEntries">Max history entries</label>
            <input
              id="maxEntries"
              type="number"
              min="1"
              max="5000"
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
          <button class="bp-btn bp-btn--primary" on:click={close}>Done</button>
        </div>
      </footer>
    </div>
  </div>
{/if}

<AboutModal isOpen={showAbout} on:close={() => showAbout = false} />

<style>
  @import '../../shared/theme.css';

  .bp-settings-modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000001;
    pointer-events: auto;
  }

  .bp-settings-panel {
    width: 500px;
    max-width: 95vw;
    max-height: 85vh;
    background: var(--bp-bg, #fff);
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.24);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .bp-settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--bp-border, #e1e1e1);
  }

  .bp-settings-header h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--bp-text, #323130);
  }

  .bp-settings-close {
    background: none;
    border: none;
    padding: 4px;
    cursor: pointer;
    color: var(--bp-text-secondary, #666);
    border-radius: 4px;
  }

  .bp-settings-close:hover {
    background: var(--bp-bg-secondary, #f0f0f0);
    color: var(--bp-text, #323130);
  }

  .bp-settings-content {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
  }

  .bp-settings-section {
    margin-bottom: 24px;
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

  .bp-btn--primary {
    background: var(--bp-accent, #0078d4);
    color: #fff;
  }

  .bp-btn--primary:hover {
    background: var(--bp-accent-hover, #106ebe);
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
