// History Observer for Azure Portal navigation
import { historyStore } from './history.store';
import { bookmarkStore } from '../bookmarks/bookmarks.store';
import { settingsStore } from '../settings/settings.store';
import { isResourcePage } from '../bookmarks/url-parser';
import { HISTORY_DEBOUNCE_MS } from '../../shared/constants';

let debounceTimer: number | null = null;
let lastUrl: string = '';
let isInitialized = false;

/**
 * Initialize history observer
 * Tracks navigation within the Azure portal
 */
export function initHistoryObserver(): void {
  if (isInitialized) {
    return;
  }

  console.log('[BetterPortal] Initializing history observer');

  // Track current URL
  lastUrl = window.location.href;

  // Override history.pushState
  const originalPushState = history.pushState;
  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    handleNavigation('pushState');
  };

  // Override history.replaceState
  const originalReplaceState = history.replaceState;
  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    handleNavigation('replaceState');
  };

  // Listen for popstate (back/forward navigation)
  window.addEventListener('popstate', () => {
    handleNavigation('popstate');
  });

  // Listen for hashchange (Azure portal uses hash-based routing)
  window.addEventListener('hashchange', () => {
    handleNavigation('hashchange');
  });

  // Initial capture of current page
  captureCurrentPage();

  isInitialized = true;
}

/**
 * Handle navigation event with debouncing
 */
function handleNavigation(source: string): void {
  const currentUrl = window.location.href;

  // Skip if URL hasn't changed
  if (currentUrl === lastUrl) {
    return;
  }

  lastUrl = currentUrl;

  // Clear existing timer
  if (debounceTimer !== null) {
    window.clearTimeout(debounceTimer);
  }

  // Debounce to avoid capturing rapid navigations
  debounceTimer = window.setTimeout(() => {
    captureCurrentPage();
    debounceTimer = null;
  }, HISTORY_DEBOUNCE_MS);
}

/**
 * Capture current page in history and optionally as bookmark
 */
async function captureCurrentPage(): Promise<void> {
  const url = window.location.href;

  // Only capture resource pages
  if (!isResourcePage(url)) {
    console.log('[BetterPortal] Skipping non-resource page:', url);
    return;
  }

  try {
    const settings = await settingsStore.get();

    // Capture in history
    const entry = await historyStore.upsert(url);
    if (entry) {
      console.log('[BetterPortal] History captured:', entry.displayName);
    }

    // Auto-bookmark if enabled
    if (settings.autoBookmark) {
      const bookmark = await bookmarkStore.saveCurrentPage();
      console.log('[BetterPortal] Auto-bookmarked:', bookmark.displayName);
    }

    // Dispatch event for overlay to refresh if open
    window.dispatchEvent(new CustomEvent('betterportal:navigation'));
  } catch (error) {
    console.error('[BetterPortal] Failed to capture page:', error);
  }
}

/**
 * Stop the history observer
 */
export function stopHistoryObserver(): void {
  if (debounceTimer !== null) {
    window.clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  isInitialized = false;
}

/**
 * Force capture of current page (bypass debounce)
 */
export async function forceCapture(): Promise<void> {
  if (debounceTimer !== null) {
    window.clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  await captureCurrentPage();
}
