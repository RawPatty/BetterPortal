// Token Extractor for Azure ARM API authentication
// Intercepts fetch/XHR to capture bearer tokens from portal requests

import { storageGet, storageSet } from '../../shared/storage';
import { ARM_API } from '../../shared/constants';

let isInitialized = false;
let cachedToken: string | null = null;
let tokenCapturedAt: number = 0;

// Token expiry buffer (refresh if less than 5 minutes remaining)
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

/**
 * Initialize token extractor
 * Intercepts fetch requests to ARM endpoints to capture auth tokens
 */
export function initTokenExtractor(): void {
  if (isInitialized) {
    return;
  }

  console.log('[BetterPortal] Initializing token extractor');

  // Intercept fetch
  const originalFetch = window.fetch;
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    // Extract token from request if it's to ARM
    try {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

      if (url.includes(ARM_API.BASE_URL) || url.includes('management.azure.com')) {
        const headers = init?.headers;
        let authHeader: string | null = null;

        if (headers instanceof Headers) {
          authHeader = headers.get('Authorization');
        } else if (Array.isArray(headers)) {
          const authEntry = headers.find(([key]) => key.toLowerCase() === 'authorization');
          authHeader = authEntry ? authEntry[1] : null;
        } else if (headers && typeof headers === 'object') {
          authHeader = (headers as Record<string, string>)['Authorization'] ||
                       (headers as Record<string, string>)['authorization'] || null;
        }

        if (authHeader && authHeader.startsWith('Bearer ')) {
          await cacheToken(authHeader);
        }
      }
    } catch (e) {
      // Silently fail - don't break fetch
    }

    return originalFetch.apply(this, [input, init]);
  };

  // Intercept XMLHttpRequest
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

  const pendingHeaders = new WeakMap<XMLHttpRequest, Record<string, string>>();

  XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...args: any[]) {
    (this as any).__bpUrl = typeof url === 'string' ? url : url.href;
    pendingHeaders.set(this, {});
    return originalXhrOpen.apply(this, [method, url, ...args]);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (name: string, value: string) {
    const headers = pendingHeaders.get(this);
    if (headers) {
      headers[name.toLowerCase()] = value;
    }

    // Check if this is an ARM request with auth header
    const url = (this as any).__bpUrl || '';
    if ((url.includes(ARM_API.BASE_URL) || url.includes('management.azure.com')) &&
        name.toLowerCase() === 'authorization' &&
        value.startsWith('Bearer ')) {
      cacheToken(value).catch(() => {});
    }

    return originalXhrSetRequestHeader.apply(this, [name, value]);
  };

  // Try to load cached token from storage
  loadCachedToken();

  isInitialized = true;
}

/**
 * Cache the extracted token
 */
async function cacheToken(authHeader: string): Promise<void> {
  const token = authHeader.replace('Bearer ', '');

  // Skip if same token
  if (token === cachedToken) {
    return;
  }

  cachedToken = token;
  tokenCapturedAt = Date.now();

  // Persist to storage
  await storageSet('cached_token', {
    token,
    capturedAt: tokenCapturedAt,
  });

  console.log('[BetterPortal] Token captured and cached');
}

/**
 * Load cached token from storage
 */
async function loadCachedToken(): Promise<void> {
  const cached = await storageGet('cached_token');
  if (cached) {
    cachedToken = cached.token;
    tokenCapturedAt = cached.capturedAt;
    console.log('[BetterPortal] Loaded cached token');
  }
}

/**
 * Get the current token for ARM API calls
 * Returns null if no token is available or if it's likely expired
 */
export async function getToken(): Promise<string | null> {
  // Try to get fresh token from storage
  const cached = await storageGet('cached_token');

  if (!cached) {
    return null;
  }

  // Check if token is likely expired (Azure tokens typically last ~1 hour)
  const tokenAge = Date.now() - cached.capturedAt;
  const TOKEN_MAX_AGE_MS = 55 * 60 * 1000; // 55 minutes

  if (tokenAge > TOKEN_MAX_AGE_MS) {
    console.log('[BetterPortal] Token likely expired, returning null');
    return null;
  }

  return cached.token;
}

/**
 * Check if we have a valid token
 */
export async function hasValidToken(): Promise<boolean> {
  const token = await getToken();
  return token !== null;
}

/**
 * Clear cached token
 */
export async function clearToken(): Promise<void> {
  cachedToken = null;
  tokenCapturedAt = 0;
  await storageSet('cached_token', null);
}

/**
 * Get token age in milliseconds
 */
export async function getTokenAge(): Promise<number | null> {
  const cached = await storageGet('cached_token');
  if (!cached) {
    return null;
  }
  return Date.now() - cached.capturedAt;
}

/**
 * Parse JWT token to extract expiry (if possible)
 * Note: Azure tokens are JWTs but we don't decode them fully for security
 */
export function parseTokenExpiry(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const payload = JSON.parse(atob(parts[1]));
    if (payload.exp) {
      return payload.exp * 1000; // Convert to milliseconds
    }
  } catch {
    // Failed to parse - return null
  }
  return null;
}
