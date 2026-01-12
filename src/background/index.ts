// BetterPortal Background Service Worker
// Handles extension lifecycle and message passing

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[BetterPortal] Extension installed');
  } else if (details.reason === 'update') {
    console.log('[BetterPortal] Extension updated');
  }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_SETTINGS') {
    chrome.storage.local.get('settings', (result) => {
      sendResponse(result.settings || null);
    });
    return true; // Keep channel open for async response
  }

  if (message.type === 'SAVE_SETTINGS') {
    chrome.storage.local.set({ settings: message.payload }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});

// Handle extension icon click when popup is not shown
chrome.action.onClicked.addListener((tab) => {
  if (tab.id && tab.url?.includes('portal.azure.com')) {
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_OVERLAY' });
  }
});

export {};
