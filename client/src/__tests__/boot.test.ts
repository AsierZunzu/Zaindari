import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import { useAuthStore } from '../stores/auth'

const mockUser = {
  id: 'user-1',
  username: 'testuser',
  displayName: 'Test User',
  email: null,
  isAdmin: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

/** A server that does not answer instantly, as on any real network. */
function slowFetch(status: number, body: unknown, delayMs = 50) {
  return vi.fn().mockImplementation(
    () =>
      new Promise((resolve) =>
        setTimeout(
          () =>
            resolve(
              new Response(JSON.stringify(body), {
                status,
                headers: { 'Content-Type': 'application/json' },
              }),
            ),
          delayMs,
        ),
      ),
  )
}

/**
 * Reproduces main.ts boot order against the real router:
 *   app.use(pinia) -> app.use(router) -> ensureInitialized() -> mount
 *
 * vue-router starts its initial navigation during install(), before the
 * session has been validated, so the guard must wait rather than read
 * half-initialised state.
 */
async function boot() {
  const { default: router } = await import('../router')

  const app = createApp({ render: () => h('div') })
  app.use(createPinia())
  app.use(router)

  const auth = useAuthStore()
  await auth.ensureInitialized()
  await router.isReady()

  return { auth, router }
}

describe('app boot', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
    window.history.replaceState({}, '', '/')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('stays on the dashboard when a cached profile is present', async () => {
    localStorage.setItem('accessToken', 'valid-token')
    localStorage.setItem('authUser', JSON.stringify(mockUser))
    vi.stubGlobal('fetch', slowFetch(200, mockUser))

    const { auth, router } = await boot()

    expect(auth.isAuthenticated).toBe(true)
    expect(router.currentRoute.value.name).toBe('dashboard')
  })

  it('stays on the dashboard when the token is valid but no profile is cached', async () => {
    // The state of a session that predates the authUser cache, or an OIDC
    // login that stored only a token. The guard must wait for getMe().
    localStorage.setItem('accessToken', 'valid-token')
    vi.stubGlobal('fetch', slowFetch(200, mockUser))

    const { auth, router } = await boot()

    expect(auth.isAuthenticated).toBe(true)
    expect(router.currentRoute.value.name).toBe('dashboard')
  })

  it('redirects to login when there is no session at all', async () => {
    vi.stubGlobal('fetch', slowFetch(200, mockUser))

    const { router } = await boot()

    expect(router.currentRoute.value.name).toBe('login')
  })

  it('validates the session only once no matter how many guards run', async () => {
    localStorage.setItem('accessToken', 'valid-token')
    const fetchMock = slowFetch(200, mockUser)
    vi.stubGlobal('fetch', fetchMock)

    const { auth, router } = await boot()
    await router.push('/settings')
    await router.push('/')

    expect(auth.isAuthenticated).toBe(true)
    const meCalls = fetchMock.mock.calls.filter(([url]) => url === '/api/me')
    expect(meCalls).toHaveLength(1)
  })
})
