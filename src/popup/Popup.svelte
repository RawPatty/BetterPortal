<script lang="ts">
  import { onMount } from 'svelte';
  import { settingsStore } from '../features/settings/settings.store';
  import { bookmarkStore } from '../features/bookmarks/bookmarks.store';

  let bookmarkCount = 0;
  let historyCount = 0;
  let hotkeyDisplay = 'Ctrl+Space';
  let version = chrome.runtime.getManifest().version;

  onMount(async () => {
    const settings = await settingsStore.get();
    const bookmarks = await bookmarkStore.getAll();

    bookmarkCount = bookmarks.length;

    if (settings.hotkey) {
      const parts = [];
      if (settings.hotkey.ctrl) parts.push('Ctrl');
      if (settings.hotkey.shift) parts.push('Shift');
      if (settings.hotkey.alt) parts.push('Alt');
      parts.push(settings.hotkey.key);
      hotkeyDisplay = parts.join('+');
    }
  });

  function openSettings() {
    // Send message to content script to open settings
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'OPEN_SETTINGS' });
        window.close();
      }
    });
  }

  async function exportData() {
    const data = await bookmarkStore.export();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `betterportal-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const json = e.target?.result as string;
      try {
        const result = await bookmarkStore.import(json);
        alert(`Imported: ${result.added} added, ${result.skipped} skipped`);
      } catch (err) {
        alert('Invalid import file');
      }
    };
    reader.readAsText(file);
  }
</script>

<div class="popup">
  <header>
    <h1>BetterPortal</h1>
    <span class="version">v{version}</span>
  </header>

  <section class="stats">
    <div class="stat">
      <span class="stat-value">{bookmarkCount}</span>
      <span class="stat-label">Bookmarks</span>
    </div>
    <div class="stat">
      <span class="stat-value">{hotkeyDisplay}</span>
      <span class="stat-label">Hotkey</span>
    </div>
  </section>

  <section class="actions">
    <button on:click={openSettings}>
      Settings
    </button>
    <button on:click={exportData}>
      Export Data
    </button>
    <button on:click={() => document.getElementById('import-input')?.click()}>
      Import Data
    </button>
    <input id="import-input" type="file" accept=".json" on:change={handleImport} hidden />
  </section>

  <footer>
    <p>Press <kbd>{hotkeyDisplay}</kbd> on Azure portal to open overlay</p>
  </footer>
</div>

<style>
  .popup {
    padding: 16px;
    background: #fafafa;
  }

  header {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid #e0e0e0;
  }

  h1 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: #0078d4;
  }

  .version {
    font-size: 12px;
    color: #666;
  }

  .stats {
    display: flex;
    gap: 16px;
    margin-bottom: 16px;
  }

  .stat {
    flex: 1;
    text-align: center;
    padding: 12px;
    background: white;
    border-radius: 8px;
    border: 1px solid #e0e0e0;
  }

  .stat-value {
    display: block;
    font-size: 20px;
    font-weight: 600;
    color: #323130;
  }

  .stat-label {
    font-size: 12px;
    color: #666;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
  }

  button {
    display: block;
    width: 100%;
    padding: 10px 16px;
    font-size: 14px;
    font-weight: 500;
    text-align: center;
    border: 1px solid #0078d4;
    border-radius: 4px;
    background: white;
    color: #0078d4;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  button:hover {
    background: #0078d4;
    color: white;
  }

  footer {
    text-align: center;
    padding-top: 12px;
    border-top: 1px solid #e0e0e0;
  }

  footer p {
    margin: 0;
    font-size: 12px;
    color: #666;
  }

  kbd {
    display: inline-block;
    padding: 2px 6px;
    font-family: monospace;
    font-size: 11px;
    background: #e0e0e0;
    border-radius: 3px;
  }
</style>
