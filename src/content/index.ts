// BetterPortal Content Script
// Injected into portal.azure.com pages

console.log('[BetterPortal] Content script file loaded');

import { mountOverlay } from './mount';
import { initHistoryObserver } from '../features/history/history.observer';
import { initTokenExtractor } from '../features/diff/token-extractor';

let overlayMounted = false;

function init() {
  console.log('[BetterPortal] init() called, readyState:', document.readyState);

  // Wait for portal to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
}

function onReady() {
  console.log('[BetterPortal] onReady() - mounting overlay');

  try {
    // Mount overlay (initially hidden)
    if (!overlayMounted) {
      mountOverlay();
      overlayMounted = true;
      console.log('[BetterPortal] Overlay mounted successfully');
    }

    // Start history observer
    initHistoryObserver();

    // Start token extractor for ARM API calls
    initTokenExtractor();

    // Listen for messages from background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'TOGGLE_OVERLAY') {
        window.dispatchEvent(new CustomEvent('betterportal:toggle'));
        sendResponse({ success: true });
      }
      return true;
    });

    console.log('[BetterPortal] Content script fully initialized');
  } catch (error) {
    console.error('[BetterPortal] Error during initialization:', error);
  }
}

init();

export {};
