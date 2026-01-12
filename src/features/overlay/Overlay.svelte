<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    isOverlayOpen,
    overlayMode,
    selectedIndex,
    searchQuery,
    itemsByTenant,
    filteredItems,
    overlayActions,
    settings,
  } from './overlay.store';
  import { settingsStore } from '../settings/settings.store';

  let searchInputRef: HTMLInputElement;
  let listRef: HTMLDivElement;

  // Track flat index for vim navigation
  $: flatItems = $filteredItems;
  $: currentItem = flatItems[$selectedIndex];

  onMount(() => {
    // Listen for toggle event from content script
    window.addEventListener('betterportal:toggle', handleToggle);

    // Listen for keyboard shortcuts
    document.addEventListener('keydown', handleGlobalKeydown);

    // Initialize settings
    overlayActions.refresh();
  });

  onDestroy(() => {
    window.removeEventListener('betterportal:toggle', handleToggle);
    document.removeEventListener('keydown', handleGlobalKeydown);
  });

  function handleToggle() {
    overlayActions.toggle();
  }

  async function handleGlobalKeydown(event: KeyboardEvent) {
    // Check if hotkey matches
    const currentSettings = $settings;
    if (currentSettings) {
      const { hotkey } = currentSettings;
      if (
        event.key === hotkey.key &&
        event.ctrlKey === hotkey.ctrl &&
        event.shiftKey === hotkey.shift &&
        event.altKey === hotkey.alt
      ) {
        event.preventDefault();
        overlayActions.toggle();
        return;
      }
    } else {
      // Default: Ctrl+Space
      if (event.key === ' ' && event.ctrlKey && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        overlayActions.toggle();
        return;
      }
    }
  }

  function handleOverlayKeydown(event: KeyboardEvent) {
    if (!$isOverlayOpen) return;

    // Vim-style navigation
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        overlayActions.close();
        break;

      case 'j':
        if ($overlayMode === 'navigate') {
          event.preventDefault();
          overlayActions.moveDown();
          scrollToSelected();
        }
        break;

      case 'k':
        if ($overlayMode === 'navigate') {
          event.preventDefault();
          overlayActions.moveUp();
          scrollToSelected();
        }
        break;

      case 'ArrowDown':
        event.preventDefault();
        overlayActions.moveDown();
        scrollToSelected();
        break;

      case 'ArrowUp':
        event.preventDefault();
        overlayActions.moveUp();
        scrollToSelected();
        break;

      case 'Enter':
        event.preventDefault();
        overlayActions.selectCurrent();
        break;

      case '/':
        if ($overlayMode === 'navigate') {
          event.preventDefault();
          overlayActions.setMode('search');
          setTimeout(() => searchInputRef?.focus(), 0);
        }
        break;

      case 'a':
        if ($overlayMode === 'navigate') {
          event.preventDefault();
          overlayActions.saveCurrentPage();
        }
        break;

      case 's':
        if ($overlayMode === 'navigate' && event.ctrlKey) {
          // Reserved for snapshot
        }
        break;

      case 'd':
        if ($overlayMode === 'navigate' && !event.ctrlKey) {
          event.preventDefault();
          overlayActions.deleteSelected();
        }
        break;

      case '?':
        if ($overlayMode === 'navigate') {
          event.preventDefault();
          overlayActions.setMode('settings');
        }
        break;
    }
  }

  function handleSearchKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      if ($searchQuery) {
        overlayActions.setSearch('');
      } else {
        overlayActions.setMode('navigate');
      }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      overlayActions.selectCurrent();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      overlayActions.moveDown();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      overlayActions.moveUp();
    }
  }

  function handleSearchInput(event: Event) {
    const target = event.target as HTMLInputElement;
    overlayActions.setSearch(target.value);
  }

  function scrollToSelected() {
    const selectedEl = listRef?.querySelector('.bp-item--selected');
    selectedEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      overlayActions.close();
    }
  }

  function getThemeClass(theme: string | undefined): string {
    return `bp-theme-${theme || 'portal'}`;
  }
</script>

{#if $isOverlayOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="bp-overlay {getThemeClass($settings?.theme)}"
    on:click={handleBackdropClick}
    on:keydown={handleOverlayKeydown}
  >
    <div class="bp-panel" role="dialog" aria-modal="true" aria-label="BetterPortal">
      <header class="bp-header">
        <h2 class="bp-title">BetterPortal</h2>
        <div class="bp-search-container">
          <input
            bind:this={searchInputRef}
            type="text"
            class="bp-search"
            placeholder="Search bookmarks... (press / to focus)"
            value={$searchQuery}
            on:input={handleSearchInput}
            on:keydown={handleSearchKeydown}
          />
          <span class="bp-search-hint">/</span>
        </div>
      </header>

      <div class="bp-list" bind:this={listRef}>
        {#if flatItems.length === 0}
          <div class="bp-empty">
            {#if $searchQuery}
              <p>No results for "{$searchQuery}"</p>
            {:else}
              <p>No bookmarks yet</p>
              <p class="bp-hint">Press <kbd>a</kbd> to add current page</p>
            {/if}
          </div>
        {:else}
          {#each [...$itemsByTenant] as [tenantId, group], groupIndex}
            <div class="bp-group">
              <div class="bp-group-header">
                <span class="bp-tenant-name">{group.tenantName}</span>
                <span class="bp-tenant-count">{group.items.length}</span>
              </div>
              {#each group.items as item, itemIndex}
                {@const flatIndex = [...$itemsByTenant]
                  .slice(0, groupIndex)
                  .reduce((acc, [, g]) => acc + g.items.length, 0) + itemIndex}
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <div
                  class="bp-item"
                  class:bp-item--selected={flatIndex === $selectedIndex}
                  class:bp-item--stale={'isStale' in item && item.isStale}
                  class:bp-item--history={item.type === 'history'}
                  on:click={() => {
                    selectedIndex.set(flatIndex);
                    overlayActions.selectCurrent();
                  }}
                  on:mouseenter={() => selectedIndex.set(flatIndex)}
                >
                  <span class="bp-item-icon">
                    {#if item.type === 'history'}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12,6 12,12 16,14"/>
                      </svg>
                    {:else}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                      </svg>
                    {/if}
                  </span>
                  <span class="bp-item-name">
                    {'alias' in item && item.alias ? item.alias : item.displayName}
                  </span>
                  {#if 'isStale' in item && item.isStale}
                    <span class="bp-item-badge bp-item-badge--stale" title="Resource may be unavailable">!</span>
                  {/if}
                </div>
              {/each}
            </div>
          {/each}
        {/if}
      </div>

      <footer class="bp-footer">
        <div class="bp-shortcuts">
          <span><kbd>j</kbd><kbd>k</kbd> navigate</span>
          <span><kbd>Enter</kbd> open</span>
          <span><kbd>a</kbd> add</span>
          <span><kbd>d</kbd> delete</span>
          <span><kbd>Esc</kbd> close</span>
        </div>
      </footer>
    </div>
  </div>
{/if}

<style>
  .bp-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 10vh;
    z-index: 999999;
    pointer-events: auto;
  }

  .bp-panel {
    width: 600px;
    max-width: 90vw;
    max-height: 70vh;
    background: var(--bp-bg, #ffffff);
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.24);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .bp-header {
    padding: 16px;
    border-bottom: 1px solid var(--bp-border, #e1e1e1);
  }

  .bp-title {
    margin: 0 0 12px 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--bp-text-secondary, #666);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .bp-search-container {
    position: relative;
  }

  .bp-search {
    width: 100%;
    padding: 10px 36px 10px 12px;
    font-size: 14px;
    border: 1px solid var(--bp-border, #e1e1e1);
    border-radius: 4px;
    background: var(--bp-bg-secondary, #f5f5f5);
    color: var(--bp-text, #323130);
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .bp-search:focus {
    border-color: var(--bp-accent, #0078d4);
    box-shadow: 0 0 0 2px rgba(0, 120, 212, 0.2);
  }

  .bp-search-hint {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 12px;
    color: var(--bp-text-secondary, #666);
    background: var(--bp-bg, #fff);
    padding: 2px 6px;
    border-radius: 3px;
    border: 1px solid var(--bp-border, #e1e1e1);
  }

  .bp-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
  }

  .bp-empty {
    padding: 32px 16px;
    text-align: center;
    color: var(--bp-text-secondary, #666);
  }

  .bp-empty p {
    margin: 0 0 8px 0;
  }

  .bp-hint {
    font-size: 12px;
  }

  .bp-group {
    margin-bottom: 8px;
  }

  .bp-group-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px 4px;
    font-size: 11px;
    font-weight: 600;
    color: var(--bp-text-secondary, #666);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .bp-tenant-count {
    font-size: 10px;
    background: var(--bp-bg-secondary, #f5f5f5);
    padding: 2px 6px;
    border-radius: 10px;
  }

  .bp-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 16px;
    cursor: pointer;
    transition: background 0.1s;
  }

  .bp-item:hover,
  .bp-item--selected {
    background: var(--bp-bg-secondary, #f5f5f5);
  }

  .bp-item--selected {
    background: var(--bp-accent, #0078d4);
    color: white;
  }

  .bp-item--selected .bp-item-icon {
    color: white;
  }

  .bp-item--stale {
    opacity: 0.6;
  }

  .bp-item--history .bp-item-icon {
    color: var(--bp-text-secondary, #666);
  }

  .bp-item-icon {
    flex-shrink: 0;
    color: var(--bp-accent, #0078d4);
    display: flex;
    align-items: center;
  }

  .bp-item-name {
    flex: 1;
    font-size: 14px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bp-item-badge {
    flex-shrink: 0;
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 3px;
    font-weight: 600;
  }

  .bp-item-badge--stale {
    background: var(--bp-warning, #f0ad4e);
    color: #fff;
  }

  .bp-footer {
    padding: 12px 16px;
    border-top: 1px solid var(--bp-border, #e1e1e1);
    background: var(--bp-bg-secondary, #f5f5f5);
  }

  .bp-shortcuts {
    display: flex;
    gap: 16px;
    font-size: 11px;
    color: var(--bp-text-secondary, #666);
  }

  kbd {
    display: inline-block;
    padding: 2px 5px;
    font-family: monospace;
    font-size: 10px;
    background: var(--bp-bg, #fff);
    border: 1px solid var(--bp-border, #e1e1e1);
    border-radius: 3px;
    margin-right: 2px;
  }

  /* Theme: Portal (default) */
  .bp-theme-portal {
    --bp-bg: #ffffff;
    --bp-bg-secondary: #f3f2f1;
    --bp-text: #323130;
    --bp-text-secondary: #605e5c;
    --bp-border: #e1dfdd;
    --bp-accent: #0078d4;
    --bp-accent-hover: #106ebe;
    --bp-error: #d13438;
    --bp-success: #107c10;
    --bp-warning: #ffaa44;
  }

  /* Theme: Dark */
  .bp-theme-dark {
    --bp-bg: #1e1e1e;
    --bp-bg-secondary: #2d2d2d;
    --bp-text: #ffffff;
    --bp-text-secondary: #a0a0a0;
    --bp-border: #3d3d3d;
    --bp-accent: #4fc3f7;
    --bp-accent-hover: #29b6f6;
    --bp-error: #f44336;
    --bp-success: #4caf50;
    --bp-warning: #ff9800;
  }

  /* Theme: Light */
  .bp-theme-light {
    --bp-bg: #ffffff;
    --bp-bg-secondary: #fafafa;
    --bp-text: #212121;
    --bp-text-secondary: #757575;
    --bp-border: #e0e0e0;
    --bp-accent: #1976d2;
    --bp-accent-hover: #1565c0;
    --bp-error: #d32f2f;
    --bp-success: #388e3c;
    --bp-warning: #f57c00;
  }
</style>
