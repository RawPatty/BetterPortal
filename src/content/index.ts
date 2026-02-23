// BetterPortal Content Script
// Injected into portal.azure.com pages

import { mountOverlay } from './mount';
import { initHistoryObserver } from '../features/history/history.observer';
import { migrateBookmarks } from '../features/bookmarks/bookmarks.store';

let overlayMounted = false;
let messageListenerAdded = false;

function init() {
  // Wait for portal to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
}

function onReady() {
  try {
    // Mount overlay (initially hidden)
    if (!overlayMounted) {
      mountOverlay();
      overlayMounted = true;
    }

    // Migrate old bookmarks that lack GUID tenantIds
    migrateBookmarks().catch(e => console.error('[BetterPortal] Bookmark migration failed:', e));

    // Start history observer immediately
    initHistoryObserver();

    // Listen for messages from background/popup (only add once)
    if (!messageListenerAdded) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'TOGGLE_OVERLAY') {
          window.dispatchEvent(new CustomEvent('betterportal:toggle'));
          sendResponse({ success: true });
        } else if (message.type === 'OPEN_SETTINGS') {
          window.dispatchEvent(new CustomEvent('betterportal:open-settings'));
          sendResponse({ success: true });
        }
        return true;
      });
      messageListenerAdded = true;
    }

  } catch (error) {
    console.error('[BetterPortal] Error during initialization:', error);
  }
}

init();

export {};
