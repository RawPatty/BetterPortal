// Mount Svelte overlay into the Azure portal DOM
import Overlay from '../features/overlay/Overlay.svelte';

let overlayInstance: Overlay | null = null;

export function mountOverlay() {
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

  console.log('[BetterPortal] Overlay mounted');

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
