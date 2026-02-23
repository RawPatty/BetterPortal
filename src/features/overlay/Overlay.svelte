<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { tick } from 'svelte';
  import {
    isOverlayOpen,
    overlayMode,
    selectedIndex,
    searchQuery,
    itemsByTenant,
    filteredItems,
    overlayActions,
    settings,
    currentDirectory,
    currentDirectoryDisplay,
    overlayError,
  } from './overlay.store';
  import { settingsStore } from '../settings/settings.store';
  import SettingsPanel from '../settings/SettingsPanel.svelte';
  import { buildNavigationUrl } from '../bookmarks/url-parser';

  let searchInputRef: HTMLInputElement;
  let listRef: HTMLDivElement;
  let showSettings = false;

  // Copy state
  let copiedItemId: string | null = null;
  let copiedTenantKey: string | null = null;

  async function copyItemUrl(item: any, event: MouseEvent) {
    event.stopPropagation();
    const url = item.tenantId ? buildNavigationUrl(item.url, item.tenantId) : item.url;
    await navigator.clipboard.writeText(url);
    copiedItemId = item.id;
    setTimeout(() => { copiedItemId = null; }, 1500);
  }

  async function copyTenantGuid(tenantKey: string, guid: string, event: MouseEvent) {
    event.stopPropagation();
    await navigator.clipboard.writeText(guid);
    copiedTenantKey = tenantKey;
    setTimeout(() => { copiedTenantKey = null; }, 1500);
  }

  // Inline rename state
  let editingItemId: string | null = null;
  let editingTenantKey: string | null = null;
  let editValue = '';

  // Track flat index for vim navigation
  $: flatItems = $filteredItems;
  $: currentItem = flatItems[$selectedIndex];

  onMount(() => {
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
    // Skip if target is an input/textarea (don't interfere with typing)
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

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

    // Don't handle keys when inline rename is active (let the input handle them)
    if (editingItemId || editingTenantKey) {
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
        searchInputRef?.blur();
        overlayActions.moveDown();
        scrollToSelected();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        searchInputRef?.blur();
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
        if ($selectedIndex === 0) {
          setTimeout(() => searchInputRef?.focus(), 0);
        } else {
          overlayActions.moveUp();
          scrollToSelected();
        }
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
        // If there's a selected history item, convert it to a bookmark
        // Otherwise, bookmark the current page
        if (currentItem?.type === 'history') {
          overlayActions.saveHistoryItem(currentItem);
        } else {
          overlayActions.saveCurrentPage();
        }
        break;

      case 'd':
        if (!event.ctrlKey) {
          event.preventDefault();
          overlayActions.deleteSelected();
        }
        break;

      case 'e':
        event.preventDefault();
        if (currentItem?.type === 'bookmark') {
          startEditItem(currentItem);
        }
        break;

      case '?':
        event.preventDefault();
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
    }
    // ArrowDown/ArrowUp are handled by the document capture listener (handleOverlayKeydown)
    // which fires first and calls moveDown/moveUp + scrollToSelected. Handling them here
    // too would call moveDown/moveUp twice, causing navigation to cancel out on small lists.
  }

  function handleSearchInput(event: Event) {
    const target = event.target as HTMLInputElement;
    overlayActions.setSearch(target.value);
  }

  function scrollToSelected() {
    const selectedEl = listRef?.querySelector('.bp-item--selected');
    selectedEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function startEditItem(item: any) {
    if (item.type !== 'bookmark') return; // Only bookmarks have alias
    editingItemId = item.id;
    editingTenantKey = null;
    editValue = item.alias || item.displayName;
    tick().then(() => {
      const input = listRef?.querySelector('.bp-rename-input') as HTMLInputElement;
      input?.focus();
      input?.select();
    });
  }

  function startEditTenant(tenantKey: string, currentDisplayName: string) {
    editingTenantKey = tenantKey;
    editingItemId = null;
    editValue = currentDisplayName;
    tick().then(() => {
      const input = listRef?.querySelector('.bp-rename-input') as HTMLInputElement;
      input?.focus();
      input?.select();
    });
  }

  function cancelEdit() {
    editingItemId = null;
    editingTenantKey = null;
    editValue = '';
  }

  async function saveEdit() {
    const trimmed = editValue.trim();
    if (editingItemId) {
      // Saving bookmark alias: empty means clear alias (revert to auto name)
      const item = flatItems.find((i: any) => i.id === editingItemId);
      if (item) {
        const originalName = item.displayName;
        const alias = (trimmed && trimmed !== originalName) ? trimmed : null;
        await overlayActions.renameBookmark(editingItemId, alias);
      }
    } else if (editingTenantKey) {
      // Saving tenant alias: empty means clear alias (revert to domain)
      // Get the original tenantName from the group data
      const group = $itemsByTenant.get(editingTenantKey);
      const originalName = group?.tenantName || editingTenantKey;
      const alias = (trimmed && trimmed !== originalName) ? trimmed : null;
      await overlayActions.renameTenant(editingTenantKey, alias);
    }
    cancelEdit();
  }

  function handleRenameKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      saveEdit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancelEdit();
    }
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
        {#if $currentDirectoryDisplay.domain}
          <div class="bp-current-dir">
            <span class="bp-current-dir-label">Current directory:</span>
            {#if $currentDirectoryDisplay.alias}
              <span class="bp-current-dir-domain">{$currentDirectoryDisplay.alias}</span>
              <span class="bp-current-dir-formal">({$currentDirectoryDisplay.domain})</span>
            {:else}
              <span class="bp-current-dir-domain">{$currentDirectoryDisplay.domain}</span>
            {/if}
          </div>
        {/if}
      </header>

      {#if $overlayError}
        <div class="bp-error-banner" role="alert">
          {$overlayError}
        </div>
      {/if}

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
            {@const tenantGuid = group.items.find(i => i.tenantId)?.tenantId ?? null}
            <div class="bp-group" class:bp-group--first={groupIndex === 0}>
              <div class="bp-group-header">
                <div class="bp-group-header-left">
                  <svg class="bp-directory-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                  {#if editingTenantKey === tenantId}
                    <!-- svelte-ignore a11y-autofocus -->
                    <input
                      class="bp-rename-input bp-rename-tenant"
                      type="text"
                      bind:value={editValue}
                      on:keydown={handleRenameKeydown}
                      on:blur={cancelEdit}
                    />
                  {:else}
                    <!-- svelte-ignore a11y-click-events-have-key-events -->
                    <!-- svelte-ignore a11y-no-static-element-interactions -->
                    <span class="bp-tenant-name bp-tenant-name--editable" on:click={() => startEditTenant(tenantId, group.displayName)}>{group.displayName}</span>
                  {/if}
                </div>
                <div class="bp-group-header-right">
                  <span class="bp-tenant-count">{group.items.length} {group.items.length === 1 ? 'item' : 'items'}</span>
                  {#if tenantGuid}
                    <!-- svelte-ignore a11y-click-events-have-key-events -->
                    <button
                      class="bp-copy-btn"
                      class:bp-copy-btn--copied={copiedTenantKey === tenantId}
                      title={copiedTenantKey === tenantId ? 'Copied!' : 'Copy directory GUID'}
                      on:click={(e) => copyTenantGuid(tenantId, tenantGuid, e)}
                    >
                      {#if copiedTenantKey === tenantId}
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                      {:else}
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      {/if}
                    </button>
                  {/if}
                </div>
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
                  {#if editingItemId === item.id}
                    <!-- svelte-ignore a11y-autofocus -->
                    <input
                      class="bp-rename-input bp-rename-item"
                      type="text"
                      bind:value={editValue}
                      on:keydown={handleRenameKeydown}
                      on:blur={cancelEdit}
                    />
                  {:else}
                    <span class="bp-item-name">
                      {'alias' in item && item.alias ? item.alias : item.displayName}
                    </span>
                  {/if}
                  {#if 'isStale' in item && item.isStale}
                    <span class="bp-item-badge bp-item-badge--stale" title="Resource may be unavailable">!</span>
                  {/if}
                  <!-- svelte-ignore a11y-click-events-have-key-events -->
                  <button
                    class="bp-copy-btn"
                    class:bp-copy-btn--copied={copiedItemId === item.id}
                    title={copiedItemId === item.id ? 'Copied!' : (item.tenantId ? 'Copy URL' : 'Copy URL (GUID unavailable — may not switch directories)')}
                    on:click={(e) => copyItemUrl(item, e)}
                  >
                    {#if copiedItemId === item.id}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                    {:else}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    {/if}
                  </button>
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
          <span><kbd>e</kbd> rename</span>
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

  .bp-tenant-name--editable {
    cursor: pointer;
    border-radius: 3px;
    padding: 1px 4px;
    margin: -1px -4px;
  }

  .bp-tenant-name--editable:hover {
    background: var(--bp-bg-secondary, rgba(0, 0, 0, 0.06));
  }

  .bp-rename-input {
    font-family: inherit;
    border: 2px solid var(--bp-accent, #0078d4);
    border-radius: 3px;
    outline: none;
    background: var(--bp-bg, #fff);
    color: var(--bp-text, #323130);
    box-sizing: border-box;
  }

  .bp-rename-tenant {
    font-size: 12px;
    font-weight: 600;
    padding: 1px 4px;
    width: 200px;
  }

  .bp-rename-item {
    flex: 1;
    font-size: 14px;
    padding: 2px 6px;
    min-width: 0;
  }

  .bp-group-header-right {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .bp-tenant-count {
    font-size: 11px;
    color: var(--bp-text-secondary, #666);
    font-weight: 400;
  }

  .bp-copy-btn {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: var(--bp-text-secondary, #666);
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s, color 0.15s, background 0.15s;
    pointer-events: auto;
  }

  .bp-copy-btn:hover {
    background: var(--bp-bg-secondary, rgba(0, 0, 0, 0.06));
    color: var(--bp-accent, #0078d4);
  }

  .bp-copy-btn--copied {
    color: #107c10;
    opacity: 1 !important;
  }

  .bp-item:hover .bp-copy-btn,
  .bp-group-header:hover .bp-copy-btn {
    opacity: 1;
  }

  .bp-item--selected .bp-copy-btn {
    color: rgba(255, 255, 255, 0.7);
  }

  .bp-item--selected .bp-copy-btn:hover {
    background: rgba(255, 255, 255, 0.15);
    color: white;
  }

  .bp-item--selected .bp-copy-btn--copied {
    color: #8be08b;
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

  .bp-current-dir {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    padding: 4px 8px;
    border-radius: 4px;
    background: var(--bp-bg-secondary, #f5f5f5);
    border: 1px solid var(--bp-border, #e1e1e1);
    font-size: 11px;
    color: var(--bp-text-secondary, #666);
    overflow: hidden;
  }

  .bp-current-dir-label {
    font-weight: 600;
    flex-shrink: 0;
  }

  .bp-current-dir-domain {
    color: var(--bp-text, #323130);
    font-weight: 500;
    flex-shrink: 0;
  }

  .bp-current-dir-formal {
    font-size: 10px;
    color: var(--bp-text-secondary, #666);
    flex-shrink: 0;
  }

  .bp-error-banner {
    padding: 8px 14px;
    background: var(--bp-error, #d13438);
    color: #fff;
    font-size: 13px;
    text-align: center;
    flex-shrink: 0;
  }

</style>
