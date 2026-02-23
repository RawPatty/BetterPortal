// History Observer for Azure Portal navigation
import { historyStore } from './history.store';
import { isResourcePage } from '../bookmarks/url-parser';
import { HISTORY_DEBOUNCE_MS } from '../../shared/constants';

let debounceTimer: number | null = null;
let pollInterval: number | null = null;
let lastUrl: string = '';
let isInitialized = false;

// Store bound event handlers for cleanup
let popstateHandler: (() => void) | null = null;
let hashchangeHandler: (() => void) | null = null;

// Poll interval for URL changes (Azure portal doesn't always trigger standard events)
const URL_POLL_INTERVAL_MS = 2000; // Increased from 1000ms to reduce CPU usage

/**
 * Initialize history observer
 * Tracks navigation within the Azure portal
 */
export function initHistoryObserver(): void {
  if (isInitialized) {
    return;
  }

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
  popstateHandler = () => handleNavigation('popstate');
  window.addEventListener('popstate', popstateHandler);

  // Listen for hashchange (Azure portal uses hash-based routing)
  hashchangeHandler = () => handleNavigation('hashchange');
  window.addEventListener('hashchange', hashchangeHandler);

  // Poll for URL changes as fallback (Azure portal may not trigger standard events)
  pollInterval = window.setInterval(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      handleNavigation('poll');
    }
  }, URL_POLL_INTERVAL_MS);

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
    return;
  }

  try {
    // Capture in history only (no auto-bookmark - user must explicitly bookmark)
    await historyStore.upsert(url);

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
  if (pollInterval !== null) {
    window.clearInterval(pollInterval);
    pollInterval = null;
  }
  // Remove event listeners
  if (popstateHandler) {
    window.removeEventListener('popstate', popstateHandler);
    popstateHandler = null;
  }
  if (hashchangeHandler) {
    window.removeEventListener('hashchange', hashchangeHandler);
    hashchangeHandler = null;
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
