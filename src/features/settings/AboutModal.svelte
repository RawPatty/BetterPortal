<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { Settings } from '../../shared/types';
  import { settingsStore } from './settings.store';
  import { DEFAULT_SETTINGS } from '../../shared/types';

  export let isOpen: boolean = false;

  const dispatch = createEventDispatcher();
  let settings: Settings = { ...DEFAULT_SETTINGS };

  onMount(async () => {
    settings = await settingsStore.get();
  });

  function close() {
    dispatch('close');
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      close();
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      close();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="bp-about-modal bp-theme-{settings.theme || 'light'}" on:click={handleBackdropClick}>
    <div class="bp-about-panel" role="dialog" aria-modal="true" aria-label="About">
      <header class="bp-about-header">
        <h2>About BetterPortal</h2>
        <button class="bp-about-close" on:click={close} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </header>

      <div class="bp-about-content">
        <section class="bp-about-section">
          <h3>Credits</h3>

          <h4>Icons</h4>
          <ul>
            <li>
              <a href="https://www.flaticon.com/free-icon/ribbon_3106811" target="_blank" rel="noopener noreferrer">
                Blue Ribbon Bookmark
              </a>
              by
              <a href="https://www.flaticon.com/authors/inkubators" target="_blank" rel="noopener noreferrer">
                inkubators
              </a>
              from
              <a href="https://www.flaticon.com/" target="_blank" rel="noopener noreferrer">
                Flaticon
              </a>
            </li>
          </ul>

          <h4>Open Source Libraries</h4>
          <ul>
            <li>
              <a href="https://github.com/farzher/fuzzysort" target="_blank" rel="noopener noreferrer">
                fuzzysort
              </a>
              - Fast fuzzy search
            </li>
            <li>
              <a href="https://github.com/flitbit/diff" target="_blank" rel="noopener noreferrer">
                deep-diff
              </a>
              - Deep object diffing
            </li>
          </ul>

          <h4>Built With</h4>
          <ul>
            <li>
              <a href="https://svelte.dev/" target="_blank" rel="noopener noreferrer">
                Svelte
              </a>
              - UI framework
            </li>
            <li>
              <a href="https://www.typescriptlang.org/" target="_blank" rel="noopener noreferrer">
                TypeScript
              </a>
              - Type system
            </li>
            <li>
              <a href="https://vitejs.dev/" target="_blank" rel="noopener noreferrer">
                Vite
              </a>
              - Build tool
            </li>
          </ul>
        </section>
      </div>

      <footer class="bp-about-footer">
        <button class="bp-btn bp-btn--primary" on:click={close}>Close</button>
      </footer>
    </div>
  </div>
{/if}

<style>
  @import '../../shared/theme.css';

  .bp-about-modal {
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

  .bp-about-panel {
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

  .bp-about-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--bp-border, #e1e1e1);
  }

  .bp-about-header h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--bp-text, #323130);
  }

  .bp-about-close {
    background: none;
    border: none;
    padding: 4px;
    cursor: pointer;
    color: var(--bp-text-secondary, #666);
    border-radius: 4px;
  }

  .bp-about-close:hover {
    background: var(--bp-bg-secondary, #f0f0f0);
    color: var(--bp-text, #323130);
  }

  .bp-about-content {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
  }

  .bp-about-section {
    margin-bottom: 24px;
  }

  .bp-about-section h3 {
    margin: 0 0 16px 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--bp-accent, #0078d4);
  }

  .bp-about-section h4 {
    margin: 16px 0 8px 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--bp-text, #323130);
  }

  .bp-about-section h4:first-of-type {
    margin-top: 0;
  }

  .bp-about-section ul {
    margin: 0;
    padding-left: 20px;
  }

  .bp-about-section li {
    margin-bottom: 8px;
    font-size: 14px;
    color: var(--bp-text-secondary, #605e5c);
    line-height: 1.5;
  }

  .bp-about-section a {
    color: var(--bp-accent, #0078d4);
    text-decoration: none;
  }

  .bp-about-section a:hover {
    text-decoration: underline;
  }

  .bp-about-footer {
    display: flex;
    justify-content: flex-end;
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
</style>
