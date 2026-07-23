/**
 * Cache-key scoping for the service worker's API cache.
 *
 * Workbox keys runtime caches by URL alone. Since every user asks for the same
 * `/api/plants` and `/api/me`, one user's responses would be replayed to the
 * next one signed in on the same device. Folding the account id into the key
 * keeps those entries apart.
 *
 * Lives outside sw.ts so it can be tested without a ServiceWorkerGlobalScope.
 */

export const API_CACHE_NAME = 'api-cache'

/** Marker param carrying the account id. Named to be obvious in devtools. */
const SCOPE_PARAM = '__acct'

const ANONYMOUS = 'anon'

/**
 * Reads the `sub` claim from a bearer token without verifying it. Safe here:
 * the value is only ever used to partition a local cache, never to authorise
 * anything. A forged token yields a useless cache bucket, nothing more.
 */
export function accountScope(authorization: string | null): string {
  if (!authorization?.startsWith('Bearer ')) return ANONYMOUS

  const segments = authorization.slice('Bearer '.length).split('.')
  if (segments.length !== 3) return ANONYMOUS

  try {
    const base64 = segments[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(base64)) as { sub?: unknown }
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : ANONYMOUS
  } catch {
    return ANONYMOUS
  }
}

/**
 * Builds the per-account cache key for an API request. The access token rotates
 * every 15 minutes but `sub` does not, so the key stays stable across refreshes
 * and the cache survives a token rotation.
 */
export function apiCacheKey(request: Request): string {
  const url = new URL(request.url)
  url.searchParams.set(SCOPE_PARAM, accountScope(request.headers.get('Authorization')))
  return url.toString()
}

/**
 * Discards every cached API response. Called from the page when a session ends
 * so nothing is left for whoever signs in next. Best-effort: CacheStorage is
 * unavailable in some browsers and in insecure contexts.
 */
export async function purgeApiCache(): Promise<void> {
  if (typeof caches === 'undefined') return
  try {
    await caches.delete(API_CACHE_NAME)
  } catch {
    // Nothing actionable; the per-account key still keeps users separated.
  }
}
