import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { api, ApiError, NetworkError } from '../client'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('ApiClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    localStorage.clear()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    // jsdom/happy-dom refuse real navigation; the client only assigns to it.
    vi.stubGlobal('location', { pathname: '/dashboard', href: '/dashboard' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends the bearer token and returns the parsed body', async () => {
    localStorage.setItem('accessToken', 'token-1')
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 'plant-1' }))

    await expect(api.get('/api/plants/plant-1')).resolves.toEqual({ id: 'plant-1' })

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers['Authorization']).toBe('Bearer token-1')
  })

  it('returns undefined for an empty 204 body', async () => {
    localStorage.setItem('accessToken', 'token-1')
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))

    await expect(api.delete('/api/plants/plant-1')).resolves.toBeUndefined()
  })

  it('refreshes via cookie on 401 and retries the original request', async () => {
    localStorage.setItem('accessToken', 'expired-token')
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { message: 'Unauthorized' }))
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'fresh-token' }))
      .mockResolvedValueOnce(jsonResponse(200, { id: 'plant-1' }))

    await expect(api.get('/api/plants/plant-1')).resolves.toEqual({ id: 'plant-1' })

    const [refreshUrl, refreshInit] = fetchMock.mock.calls[1]
    expect(refreshUrl).toBe('/api/auth/refresh')
    // The cookie is the credential; sending the dead access token would be
    // pointless and is exactly what made the old endpoint unusable.
    expect(refreshInit.headers).toBeUndefined()
    expect(refreshInit.credentials).toBe('same-origin')

    // The retry must carry the new token, and it must be persisted.
    expect(fetchMock.mock.calls[2][1].headers['Authorization']).toBe(
      'Bearer fresh-token',
    )
    expect(localStorage.getItem('accessToken')).toBe('fresh-token')
  })

  it('refreshes only once for concurrent 401s', async () => {
    localStorage.setItem('accessToken', 'expired-token')
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/auth/refresh') {
        return Promise.resolve(jsonResponse(200, { accessToken: 'fresh-token' }))
      }
      const token = localStorage.getItem('accessToken')
      return Promise.resolve(
        token === 'fresh-token'
          ? jsonResponse(200, { ok: true })
          : jsonResponse(401, { message: 'Unauthorized' }),
      )
    })

    await Promise.all([
      api.get('/api/plants'),
      api.get('/api/tasks'),
      api.get('/api/dashboard'),
    ])

    // Rotating refresh tokens make a second concurrent refresh look like a
    // replay, which would revoke the whole family.
    const refreshCalls = fetchMock.mock.calls.filter(
      ([url]) => url === '/api/auth/refresh',
    )
    expect(refreshCalls).toHaveLength(1)
  })

  it('clears the session when the refresh is rejected', async () => {
    localStorage.setItem('accessToken', 'expired-token')
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { message: 'Unauthorized' }))
      .mockResolvedValueOnce(jsonResponse(401, { message: 'No refresh token' }))

    await expect(api.get('/api/plants')).rejects.toThrow(ApiError)
    expect(localStorage.getItem('accessToken')).toBeNull()
  })

  it('keeps the token when the refresh fails because the server is unreachable', async () => {
    localStorage.setItem('accessToken', 'expired-token')
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { message: 'Unauthorized' }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(api.get('/api/plants')).rejects.toThrow(NetworkError)
    // A restart must not destroy a session that may still be perfectly valid.
    expect(localStorage.getItem('accessToken')).toBe('expired-token')
  })

  it('raises NetworkError when the server cannot be reached at all', async () => {
    localStorage.setItem('accessToken', 'token-1')
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(api.get('/api/plants')).rejects.toThrow(NetworkError)
  })

  it('surfaces the server message for non-auth errors', async () => {
    localStorage.setItem('accessToken', 'token-1')
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { message: 'Plant not found' }))

    await expect(api.get('/api/plants/nope')).rejects.toThrow('Plant not found')
  })
})
