/**
 * This script runs in the MAIN world (page context), giving it access to window.Portal, etc.
 * It communicates with the isolated content script via custom DOM events and data attributes.
 *
 * Registered in manifest.json with "world": "MAIN" - do NOT import from isolated content scripts.
 */
(function () {
  const ATTR_NAME = 'data-betterportal-tenant-guid';
  const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function extractGuid(): string | null {
    const w = window as Record<string, unknown>;

    const accessors = [
      () => (w['Portal'] as Record<string, unknown> | undefined)?.['tenant']?.['id'],
      () => (w['Portal'] as Record<string, unknown> | undefined)?.['TenantId'],
      () => (w['Portal'] as Record<string, unknown> | undefined)?.['tenantId'],
      () =>
        (w['Portal'] as Record<string, unknown> | undefined)?.['Environment']?.[
          'tenantId'
        ],
      () =>
        (w['Portal'] as Record<string, unknown> | undefined)?.['Environment']?.[
          'directoryId'
        ],
      () =>
        (w['fx'] as Record<string, unknown> | undefined)?.['environment']?.[
          'tenantId'
        ],
      () =>
        (w['fx'] as Record<string, unknown> | undefined)?.['environment']?.[
          'directoryId'
        ],
      () => {
        const msPortal = w['MsPortalFx'] as Record<string, unknown> | undefined;
        const fn =
          msPortal?.['Base']?.['Security']?.['getTenantId'];
        return typeof fn === 'function' ? (fn as () => unknown)() : undefined;
      },
      () =>
        (w['MsPortalFx'] as Record<string, unknown> | undefined)?.['environment']?.[
          'tenantId'
        ],
      () =>
        (w['__portal__'] as Record<string, unknown> | undefined)?.['tenantId'],
      () =>
        (w['portalEnvironment'] as Record<string, unknown> | undefined)?.['tenantId'],
      () => {
        const portal = w['Portal'] as Record<string, unknown> | undefined;
        const getContext = portal?.['getContext'];
        return typeof getContext === 'function'
          ? (getContext as () => Record<string, unknown> | null)()?.['tenantId']
          : undefined;
      },
    ];

    for (const accessor of accessors) {
      try {
        const val = accessor();
        if (val && typeof val === 'string' && guidRegex.test(val)) {
          return val;
        }
      } catch {
        // ignore
      }
    }

    return null;
  }

  document.addEventListener('betterportal:get-tenant', () => {
    document.documentElement.removeAttribute(ATTR_NAME);
    const guid = extractGuid();
    if (guid) {
      document.documentElement.setAttribute(ATTR_NAME, guid);
    }
  });
})();
