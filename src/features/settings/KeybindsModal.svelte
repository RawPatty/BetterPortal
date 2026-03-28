<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { Settings, HotkeyConfig, OverlayKeybinds } from '../../shared/types';
  import { settingsStore } from './settings.store';
  import { DEFAULT_SETTINGS } from '../../shared/types';

  export let isOpen: boolean = false;

  const dispatch = createEventDispatcher();
  let settings: Settings = { ...DEFAULT_SETTINGS };
  let recordingField: string | null = null;

  onMount(async () => {
    settings = await settingsStore.get();
  });

  function close() {
    dispatch('close');
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) close();
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && !recordingField) close();
  }

  // ── Formatting ────────────────────────────────────────────────────────────

  function formatHotkey(config: HotkeyConfig): string {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const parts: string[] = [];
    if (config.ctrl) parts.push('Ctrl');
    if (config.shift) parts.push('Shift');
    if (config.alt) parts.push('Alt');
    if (config.meta) parts.push(isMac ? '⌘' : 'Meta');
    parts.push(config.key);
    return parts.join('+');
  }

  // ── Recording ─────────────────────────────────────────────────────────────

  function startRecording(field: string) {
    recordingField = field;
  }

  function cancelRecording() {
    recordingField = null;
  }

  function handleRecorderKeydown(event: KeyboardEvent) {
    if (!recordingField) return;
    event.preventDefault();

    if (event.key === 'Escape') {
      cancelRecording();
      return;
    }

    if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return;

    const normalizedKey = event.key === ' ' ? 'Space' : event.key;
    const newConfig: HotkeyConfig = {
      key: normalizedKey,
      ctrl: event.ctrlKey,
      shift: event.shiftKey,
      alt: event.altKey,
      meta: event.metaKey,
    };

    applyNewKeybind(recordingField, newConfig);
  }

  // ── Conflict detection ────────────────────────────────────────────────────

  function hotkeysEqual(a: HotkeyConfig, b: HotkeyConfig): boolean {
    return (
      a.key === b.key &&
      a.ctrl === b.ctrl &&
      a.shift === b.shift &&
      a.alt === b.alt &&
      (a.meta || false) === (b.meta || false)
    );
  }

  const OVERLAY_FIELDS = ['navDown', 'navUp', 'search', 'add', 'delete', 'edit', 'settings'] as const;
  type OverlayField = typeof OVERLAY_FIELDS[number];

  function getKeybind(field: string): HotkeyConfig | null {
    return settings.overlayKeybinds[field as OverlayField];
  }

  function applyNewKeybind(targetField: string, newConfig: HotkeyConfig) {
    const updatedKeybinds = { ...settings.overlayKeybinds };

    // Clear any other overlay keybind that conflicts with the new value
    for (const field of OVERLAY_FIELDS) {
      if (field === targetField) continue;
      const existing = updatedKeybinds[field];
      if (existing && hotkeysEqual(existing, newConfig)) {
        updatedKeybinds[field] = null;
      }
    }

    if (targetField === 'hotkey') {
      settings = { ...settings, hotkey: newConfig, overlayKeybinds: updatedKeybinds };
    } else {
      updatedKeybinds[targetField as OverlayField] = newConfig;
      settings = { ...settings, overlayKeybinds: updatedKeybinds };
    }

    recordingField = null;
    saveSettings();
  }

  // ── Save / Reset ──────────────────────────────────────────────────────────

  async function saveSettings() {
    await settingsStore.update(settings);
    dispatch('settingsChanged', settings);
  }

  async function resetKeybinds() {
    settings = {
      ...settings,
      hotkey: { ...DEFAULT_SETTINGS.hotkey },
      overlayKeybinds: { ...DEFAULT_SETTINGS.overlayKeybinds },
    };
    await saveSettings();
  }
</script>

<svelte:window on:keydown={handleWindowKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="bp-keybinds-modal bp-theme-{settings.theme || 'dark'}" on:click={handleBackdropClick}>
    <div class="bp-keybinds-panel" role="dialog" aria-modal="true" aria-label="Keybinds">
      <header class="bp-keybinds-header">
        <h2>Keybinds</h2>
        <button class="bp-keybinds-close" on:click={close} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </header>

      <div class="bp-keybinds-content">

        <!-- Open Overlay -->
        <section class="bp-kb-section">
          <h3>Open Overlay</h3>
          <div class="bp-kb-row">
            <span class="bp-kb-label">Open / close overlay</span>
            <div class="bp-kb-control">
              {#if recordingField === 'hotkey'}
                <!-- svelte-ignore a11y-autofocus -->
                <input
                  class="bp-kb-recorder"
                  type="text"
                  placeholder="Press shortcut..."
                  on:keydown={handleRecorderKeydown}
                  on:blur={cancelRecording}
                  autofocus
                  readonly
                />
                <button class="bp-btn-small" on:click={cancelRecording}>Cancel</button>
              {:else}
                <kbd class="bp-kb-display">{formatHotkey(settings.hotkey)}</kbd>
                <button class="bp-btn-small" on:click={() => startRecording('hotkey')}>Change</button>
              {/if}
            </div>
          </div>
        </section>

        <!-- Navigation -->
        <section class="bp-kb-section">
          <h3>Navigation</h3>
          <div class="bp-kb-nav-header">
            <span class="bp-kb-col-label">Action</span>
            <span class="bp-kb-col-label">Primary</span>
            <span class="bp-kb-col-label">Secondary</span>
          </div>

          <!-- Navigate down -->
          <div class="bp-kb-nav-row">
            <span class="bp-kb-label">Navigate down</span>
            <kbd class="bp-kb-display bp-kb-display--fixed">↓</kbd>
            <div class="bp-kb-control">
              {#if recordingField === 'navDown'}
                <!-- svelte-ignore a11y-autofocus -->
                <input
                  class="bp-kb-recorder"
                  type="text"
                  placeholder="Press key..."
                  on:keydown={handleRecorderKeydown}
                  on:blur={cancelRecording}
                  autofocus
                  readonly
                />
                <button class="bp-btn-small" on:click={cancelRecording}>Cancel</button>
              {:else if settings.overlayKeybinds.navDown}
                <kbd class="bp-kb-display">{formatHotkey(settings.overlayKeybinds.navDown)}</kbd>
                <button class="bp-btn-small" on:click={() => startRecording('navDown')}>Change</button>
              {:else}
                <span class="bp-kb-unassigned">Unassigned</span>
                <button class="bp-btn-small" on:click={() => startRecording('navDown')}>Assign</button>
              {/if}
            </div>
          </div>

          <!-- Navigate up -->
          <div class="bp-kb-nav-row">
            <span class="bp-kb-label">Navigate up</span>
            <kbd class="bp-kb-display bp-kb-display--fixed">↑</kbd>
            <div class="bp-kb-control">
              {#if recordingField === 'navUp'}
                <!-- svelte-ignore a11y-autofocus -->
                <input
                  class="bp-kb-recorder"
                  type="text"
                  placeholder="Press key..."
                  on:keydown={handleRecorderKeydown}
                  on:blur={cancelRecording}
                  autofocus
                  readonly
                />
                <button class="bp-btn-small" on:click={cancelRecording}>Cancel</button>
              {:else if settings.overlayKeybinds.navUp}
                <kbd class="bp-kb-display">{formatHotkey(settings.overlayKeybinds.navUp)}</kbd>
                <button class="bp-btn-small" on:click={() => startRecording('navUp')}>Change</button>
              {:else}
                <span class="bp-kb-unassigned">Unassigned</span>
                <button class="bp-btn-small" on:click={() => startRecording('navUp')}>Assign</button>
              {/if}
            </div>
          </div>
        </section>

        <!-- Actions -->
        <section class="bp-kb-section">
          <h3>Actions</h3>

          {#each [
            { field: 'search',   label: 'Search' },
            { field: 'add',      label: 'Add bookmark' },
            { field: 'delete',   label: 'Delete selected' },
            { field: 'edit',     label: 'Edit / rename' },
            { field: 'settings', label: 'Open settings' },
          ] as row (row.field)}
            {@const config = getKeybind(row.field)}
            <div class="bp-kb-row">
              <span class="bp-kb-label">{row.label}</span>
              <div class="bp-kb-control">
                {#if recordingField === row.field}
                  <!-- svelte-ignore a11y-autofocus -->
                  <input
                    class="bp-kb-recorder"
                    type="text"
                    placeholder="Press key..."
                    on:keydown={handleRecorderKeydown}
                    on:blur={cancelRecording}
                    autofocus
                    readonly
                  />
                  <button class="bp-btn-small" on:click={cancelRecording}>Cancel</button>
                {:else if config}
                  <kbd class="bp-kb-display">{formatHotkey(config)}</kbd>
                  <button class="bp-btn-small" on:click={() => startRecording(row.field)}>Change</button>
                {:else}
                  <span class="bp-kb-unassigned">Unassigned</span>
                  <button class="bp-btn-small" on:click={() => startRecording(row.field)}>Assign</button>
                {/if}
              </div>
            </div>
          {/each}
        </section>

      </div>

      <footer class="bp-keybinds-footer">
        <button class="bp-btn bp-btn--secondary" on:click={resetKeybinds}>Reset to Defaults</button>
        <button class="bp-btn bp-btn--primary" on:click={close}>Done</button>
      </footer>
    </div>
  </div>
{/if}

<style>
  @import '../../shared/theme.css';

  .bp-keybinds-modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000002;
    pointer-events: auto;
  }

  .bp-keybinds-panel {
    width: 520px;
    max-width: 95vw;
    max-height: 85vh;
    background: var(--bp-bg, #fff);
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.24);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .bp-keybinds-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--bp-border, #e1e1e1);
  }

  .bp-keybinds-header h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--bp-text, #323130);
  }

  .bp-keybinds-close {
    background: none;
    border: none;
    padding: 4px;
    cursor: pointer;
    color: var(--bp-text-secondary, #666);
    border-radius: 4px;
  }

  .bp-keybinds-close:hover {
    background: var(--bp-bg-secondary, #f0f0f0);
    color: var(--bp-text, #323130);
  }

  .bp-keybinds-content {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
  }

  .bp-kb-section {
    margin-bottom: 24px;
  }

  .bp-kb-section h3 {
    margin: 0 0 12px 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--bp-accent, #0078d4);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .bp-kb-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
    gap: 12px;
  }

  .bp-kb-nav-header {
    display: grid;
    grid-template-columns: 1fr 80px 160px;
    gap: 8px;
    margin-bottom: 8px;
  }

  .bp-kb-col-label {
    font-size: 11px;
    color: var(--bp-text-secondary, #666);
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .bp-kb-nav-row {
    display: grid;
    grid-template-columns: 1fr 80px 160px;
    gap: 8px;
    align-items: center;
    margin-bottom: 10px;
  }

  .bp-kb-label {
    font-size: 14px;
    color: var(--bp-text, #323130);
  }

  .bp-kb-control {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .bp-kb-display {
    display: inline-block;
    padding: 4px 10px;
    font-family: monospace;
    font-size: 13px;
    background: var(--bp-bg-secondary, #f5f5f5);
    border: 1px solid var(--bp-border, #e1e1e1);
    border-radius: 4px;
    color: var(--bp-text, #323130);
    min-width: 32px;
    text-align: center;
  }

  .bp-kb-display--fixed {
    color: var(--bp-text-secondary, #666);
    opacity: 0.7;
  }

  .bp-kb-unassigned {
    display: inline-block;
    padding: 4px 10px;
    font-size: 12px;
    color: var(--bp-warning, #f0ad4e);
    border: 1px solid var(--bp-warning, #f0ad4e);
    border-radius: 4px;
    font-style: italic;
  }

  .bp-kb-recorder {
    padding: 4px 10px;
    font-size: 13px;
    border: 2px solid var(--bp-accent, #0078d4);
    border-radius: 4px;
    outline: none;
    width: 140px;
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
    white-space: nowrap;
  }

  .bp-btn-small:hover {
    background: var(--bp-border, #e1e1e1);
  }

  .bp-keybinds-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 20px;
    border-top: 1px solid var(--bp-border, #e1e1e1);
    background: var(--bp-bg-secondary, #f8f8f8);
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
