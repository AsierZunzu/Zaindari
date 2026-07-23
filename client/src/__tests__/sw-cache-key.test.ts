import { describe, it, expect, vi, afterEach } from 'vitest'
import { accountScope, apiCacheKey, purgeApiCache, API_CACHE_NAME } from '../sw-cache-key'

/** Builds an unsigned JWT-shaped token; only the payload segment is read. */
function tokenFor(payload: Record<string, unknown>) {
  const body = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_')
  return `header.${body}.signature`
}

function requestWith(url: string, token?: string) {
  return new Request(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
}

describe('accountScope', () => {
  it('extracts the subject claim', () => {
    expect(accountScope(`Bearer ${tokenFor({ sub: 'user-1' })}`)).toBe('user-1')
  })

  it('falls back to anon without a bearer token', () => {
    expect(accountScope(null)).toBe('anon')
    expect(accountScope('')).toBe('anon')
    expect(accountScope('Basic abc')).toBe('anon')
  })

  it('falls back to anon for malformed tokens', () => {
    expect(accountScope('Bearer not-a-jwt')).toBe('anon')
    expect(accountScope('Bearer a.b.c')).toBe('anon')
    expect(accountScope(`Bearer ${tokenFor({ username: 'nope' })}`)).toBe('anon')
  })
})

describe('apiCacheKey', () => {
  it('gives two users different keys for the same URL', () => {
    const alice = apiCacheKey(requestWith('https://app/api/plants', tokenFor({ sub: 'alice' })))
    const bob = apiCacheKey(requestWith('https://app/api/plants', tokenFor({ sub: 'bob' })))

    expect(alice).not.toBe(bob)
    expect(alice).toContain('__acct=alice')
    expect(bob).toContain('__acct=bob')
  })

  it('is stable across token rotation for the same account', () => {
    // The access token changes every 15 minutes; the cache must not be orphaned.
    const first = apiCacheKey(
      requestWith('https://app/api/plants', tokenFor({ sub: 'alice', iat: 1 })),
    )
    const second = apiCacheKey(
      requestWith('https://app/api/plants', tokenFor({ sub: 'alice', iat: 2 })),
    )

    expect(first).toBe(second)
  })

  it('keeps distinct endpoints and query strings distinct', () => {
    const token = tokenFor({ sub: 'alice' })
    const plants = apiCacheKey(requestWith('https://app/api/plants', token))
    const tasks = apiCacheKey(requestWith('https://app/api/tasks', token))
    const filtered = apiCacheKey(requestWith('https://app/api/tasks?status=pending', token))

    expect(new Set([plants, tasks, filtered]).size).toBe(3)
    expect(filtered).toContain('status=pending')
  })

  it('scopes unauthenticated requests separately from any user', () => {
    const anon = apiCacheKey(requestWith('https://app/api/plants'))
    const alice = apiCacheKey(requestWith('https://app/api/plants', tokenFor({ sub: 'alice' })))

    expect(anon).toContain('__acct=anon')
    expect(anon).not.toBe(alice)
  })
})

describe('purgeApiCache', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('deletes the api cache', async () => {
    const del = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('caches', { delete: del })

    await purgeApiCache()

    expect(del).toHaveBeenCalledWith(API_CACHE_NAME)
  })

  it('does not throw when CacheStorage is unavailable', async () => {
    vi.stubGlobal('caches', undefined)
    await expect(purgeApiCache()).resolves.toBeUndefined()
  })

  it('swallows a rejected delete', async () => {
    vi.stubGlobal('caches', { delete: vi.fn().mockRejectedValue(new Error('nope')) })
    await expect(purgeApiCache()).resolves.toBeUndefined()
  })
})
