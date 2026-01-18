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
  import SettingsPanel from '../settings/SettingsPanel.svelte';

  let searchInputRef: HTMLInputElement;
  let listRef: HTMLDivElement;
  let showSettings = false;

  // Track flat index for vim navigation
  $: flatItems = $filteredItems;
  $: currentItem = flatItems[$selectedIndex];

  onMount(() => {
    console.log('[BetterPortal] Overlay component mounted');

    // Listen for toggle event from content script
    window.addEventListener('betterportal:toggle', handleToggle);

    // Listen for open-settings event from content script
    window.addEventListener('betterportal:open-settings', handleOpenSettings);

    // Listen for navigation events to refresh list
    window.addEventListener('betterportal:navigation', handleNavigation);

    // Listen for keyboard shortcuts (global hotkey)
    document.addEventListener('keydown', handleGlobalKeydown, true);

    // Listen for overlay keyboard navigation
    document.addEventListener('keydown', handleOverlayKeydown, true);

    // Initialize settings
    overlayActions.refresh();

    console.log('[BetterPortal] Keyboard listener registered');
  });

  onDestroy(() => {
    window.removeEventListener('betterportal:toggle', handleToggle);
    window.removeEventListener('betterportal:open-settings', handleOpenSettings);
    window.removeEventListener('betterportal:navigation', handleNavigation);
    document.removeEventListener('keydown', handleGlobalKeydown);
    document.removeEventListener('keydown', handleOverlayKeydown);
  });

  function handleOpenSettings() {
    showSettings = true;
  }

  function handleNavigation() {
    // Refresh the list if overlay is open
    if ($isOverlayOpen) {
      overlayActions.refresh();
    }
  }

  function handleToggle() {
    overlayActions.toggle();
  }

  async function handleGlobalKeydown(event: KeyboardEvent) {
    // Normalize key for comparison (Space key returns ' ')
    const pressedKey = event.key === ' ' ? 'Space' : event.key;

    // Check if hotkey matches
    const currentSettings = $settings;
    const hotkey = currentSettings?.hotkey || { key: 'Space', ctrl: true, shift: false, alt: false, meta: false };

    if (
      pressedKey === hotkey.key &&
      event.ctrlKey === hotkey.ctrl &&
      event.shiftKey === hotkey.shift &&
      event.altKey === hotkey.alt &&
      event.metaKey === (hotkey.meta || false)
    ) {
      event.preventDefault();
      event.stopPropagation();
      overlayActions.toggle();
      return;
    }
  }

  function handleOverlayKeydown(event: KeyboardEvent) {
    if (!$isOverlayOpen) return;

    // Don't handle keys when settings panel is open (let it handle its own events)
    if (showSettings) {
      // Only handle Escape to close settings
      if (event.key === 'Escape') {
        event.preventDefault();
        showSettings = false;
      }
      return;
    }

    // Check if user is typing in search input
    const isTypingInSearch = document.activeElement === searchInputRef;

    // Escape always works
    if (event.key === 'Escape') {
      event.preventDefault();
      if (showSettings) {
        showSettings = false;
      } else if (isTypingInSearch && $searchQuery) {
        overlayActions.setSearch('');
        searchInputRef?.blur();
      } else {
        overlayActions.close();
      }
      return;
    }

    // If typing in search, only handle special keys
    if (isTypingInSearch) {
      if (event.key === 'Enter') {
        event.preventDefault();
        overlayActions.selectCurrent();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        overlayActions.moveDown();
        scrollToSelected();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        overlayActions.moveUp();
        scrollToSelected();
      }
      // Let all other keys go through to the input
      return;
    }

    // Vim-style navigation (only when not typing)
    switch (event.key) {
      case 'j':
        event.preventDefault();
        overlayActions.moveDown();
        scrollToSelected();
        break;

      case 'k':
        event.preventDefault();
        overlayActions.moveUp();
        scrollToSelected();
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
        event.preventDefault();
        setTimeout(() => searchInputRef?.focus(), 0);
        break;

      case 'a':
        event.preventDefault();
        overlayActions.saveCurrentPage();
        break;

      case 's':
        event.preventDefault();
        // TODO: Capture snapshot
        console.log('[BetterPortal] Snapshot capture - not yet implemented');
        break;

      case 'd':
        if (!event.ctrlKey) {
          event.preventDefault();
          overlayActions.deleteSelected();
        }
        break;

      case '?':
        event.preventDefault();
        console.log('[BetterPortal] Opening settings panel');
        showSettings = true;
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
    return `bp-theme-${theme || 'light'}`;
  }
</script>

{#if $isOverlayOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="bp-overlay {getThemeClass($settings?.theme)}"
    on:click={handleBackdropClick}
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
            <div class="bp-group" class:bp-group--first={groupIndex === 0}>
              <div class="bp-group-header">
                <div class="bp-group-header-left">
                  <svg class="bp-directory-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                  <span class="bp-tenant-name">{group.tenantName}</span>
                </div>
                <span class="bp-tenant-count">{group.items.length} {group.items.length === 1 ? 'item' : 'items'}</span>
              </div>
              {#each group.items as item, itemIndex}
                {@const flatIndex = flatItems.findIndex(fi => fi.id === item.id)}
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
          <span><kbd>↑</kbd><kbd>↓</kbd> or <kbd>j</kbd><kbd>k</kbd> navigate</span>
          <span><kbd>Enter</kbd> open</span>
          <span><kbd>/</kbd> search</span>
          <span><kbd>a</kbd> add</span>
          <span><kbd>d</kbd> delete</span>
          <span><kbd>?</kbd> settings</span>
          <span><kbd>Esc</kbd> close</span>
        </div>
      </footer>
    </div>
  </div>
{/if}

<SettingsPanel
  isOpen={showSettings}
  on:close={() => showSettings = false}
  on:settingsChanged={() => overlayActions.refresh()}
/>

<style>
  @import '../../shared/theme.css';

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
    min-height: 400px;
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
    overflow: hidden;
  }

  .bp-search {
    width: 100%;
    box-sizing: border-box;
    padding: 10px 36px 10px 12px;
    font-size: 14px;
    border: 2px solid var(--bp-border, #e1e1e1);
    border-radius: 4px;
    background: var(--bp-bg-secondary, #f5f5f5);
    color: var(--bp-text, #323130);
    outline: none;
    transition: border-color 0.15s;
  }

  .bp-search:focus {
    border-color: var(--bp-accent, #0078d4);
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
    min-height: 200px;
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
    margin-bottom: 0;
    border-top: 2px solid var(--bp-border, #e1e1e1);
    padding-top: 4px;
  }

  .bp-group--first {
    border-top: none;
    padding-top: 0;
  }

  .bp-group-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--bp-text, #323130);
    background: var(--bp-bg-tertiary, rgba(0, 120, 212, 0.06));
    border-bottom: 1px solid var(--bp-border, #e1e1e1);
    margin-bottom: 4px;
  }

  .bp-group-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .bp-directory-icon {
    color: var(--bp-accent, #0078d4);
    flex-shrink: 0;
  }

  .bp-tenant-name {
    font-weight: 600;
  }

  .bp-tenant-count {
    font-size: 11px;
    color: var(--bp-text-secondary, #666);
    font-weight: 400;
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
    color: var(--bp-text, #323130);
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

</style>
