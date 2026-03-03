// Mount Svelte overlay into the Azure portal DOM
import Overlay from '../features/overlay/Overlay.svelte';

let overlayInstance: Overlay | null = null;

/**
 * Inject extension CSS files into the page.
 * The build plugin extracts Svelte component CSS into separate files and lists them
 * in web_accessible_resources, but doesn't auto-inject them into content script pages.
 */
function injectExtensionStyles() {
  const manifest = chrome.runtime.getManifest();
  const war = manifest.web_accessible_resources;
  if (!war) return;
  for (const entry of war) {
    const resources = (typeof entry === 'string') ? [entry] : (entry as { resources: string[] }).resources || [];
    for (const resource of resources) {
      if (resource.endsWith('.css')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL(resource);
        document.head.appendChild(link);
      }
    }
  }
}

export function mountOverlay() {
  // Inject CSS extracted by the build plugin
  injectExtensionStyles();

  // Create container for overlay
  const container = document.createElement('div');
  container.id = 'betterportal-root';
  container.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 999999;
    pointer-events: none;
  `;

  document.body.appendChild(container);

  // Mount Svelte component
  overlayInstance = new Overlay({
    target: container,
  });

  return overlayInstance;
}

export function unmountOverlay() {
  if (overlayInstance) {
    overlayInstance.$destroy();
    overlayInstance = null;
  }

  const container = document.getElementById('betterportal-root');
  if (container) {
    container.remove();
  }
}
