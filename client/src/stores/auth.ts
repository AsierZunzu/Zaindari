import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi } from '../api/auth'
import { ApiError, NetworkError } from '../api/client'
import { purgeApiCache } from '../sw-cache-key'
import { isSupportedLocale, setLocale, type Locale } from '../i18n'
import type { User, RegisterData } from '../types'

const TOKEN_KEY = 'accessToken'
const USER_KEY = 'authUser'

/**
 * The profile is cached so a reload while the server is unreachable can still
 * render the app instead of bouncing to /login. It is only ever a mirror of
 * what the server last told us — never a source of authority. Every API call
 * is still authorised server-side against the token.
 */
function readCachedUser(): User | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as User
  } catch {
    localStorage.removeItem(USER_KEY)
    return null
  }
}

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(localStorage.getItem(TOKEN_KEY))
  const user = ref<User | null>(accessToken.value ? readCachedUser() : null)
  /** True when we hold a session but couldn't reach the server to revalidate it. */
  const offline = ref(false)

  const isAuthenticated = computed(() => !!accessToken.value && !!user.value)
  const isAdmin = computed(() => user.value?.isAdmin ?? false)

  /**
   * Memoises the one-shot session bootstrap so the router guard can await it.
   * Without this the guard races initialize(): vue-router starts its initial
   * navigation during app.use(router), long before getMe() comes back, and a
   * valid session gets bounced to /login on every reload.
   */
  let initPromise: Promise<void> | null = null

  function persistSession(token: string, profile: User) {
    accessToken.value = token
    user.value = profile
    offline.value = false
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(profile))
    initPromise = Promise.resolve()

    // The account is the authority on language once we know who is signed in.
    // The local copy is only ever the pre-login guess, so adopting the server's
    // answer here is what makes the choice follow the user across devices.
    if (isSupportedLocale(profile.locale)) {
      setLocale(profile.locale)
    }
  }

  function clearSession() {
    accessToken.value = null
    user.value = null
    offline.value = false
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    // The locale deliberately survives: flipping the login screen back to
    // English the moment someone signs out would be its own small bug.
    initPromise = Promise.resolve()
    // Fire-and-forget: the service worker may still hold this account's API
    // responses, and the next person to sign in on this device must not see them.
    void purgeApiCache()
  }

  async function login(username: string, password: string) {
    const response = await authApi.login(username, password)
    persistSession(response.accessToken, response.user)
  }

  async function register(data: RegisterData) {
    const response = await authApi.register(data)
    persistSession(response.accessToken, response.user)
  }

  async function logout() {
    // Revoke the refresh token server-side and drop the cookie. Best-effort:
    // a failure here must not trap the user in a logged-in UI.
    try {
      await authApi.logout()
    } catch {
      // ignore
    }
    clearSession()
  }

  async function refreshToken() {
    const response = await authApi.refreshToken()
    accessToken.value = response.accessToken
    localStorage.setItem(TOKEN_KEY, response.accessToken)
  }

  /**
   * Decides what to do when the session bootstrap request fails.
   *
   * This runs at app start, so it determines whether a user comes back to a
   * working app or to the login screen.
   *
   * Policy: only the server can end a session. Anything meaning "the server
   * didn't get a chance to answer" keeps the session — a restarting container
   * must not log anyone out. Only an explicit rejection clears it.
   *
   * NOTE: the api client has already tried and failed to refresh via the
   * refresh cookie before any 401 reaches here.
   */
  function classifyInitError(error: unknown): 'keep' | 'clear' {
    // Server unreachable: offline, container restarting, proxy down.
    if (error instanceof NetworkError) return 'keep'

    // 5xx is the server failing to serve, not refusing us. The PWA shell is
    // cached, so this is the usual shape of a reload mid-restart (502/503).
    if (error instanceof ApiError && error.status >= 500) return 'keep'

    // 401/403 after the api client already failed to refresh: genuinely dead.
    return 'clear'
  }

  async function initialize() {
    if (!accessToken.value) return
    try {
      const profile = await authApi.getMe()
      // getMe may have transparently rotated the token via the refresh cookie,
      // so take whatever the api client just wrote rather than our stale ref.
      persistSession(localStorage.getItem(TOKEN_KEY) ?? accessToken.value, profile)
    } catch (error) {
      if (classifyInitError(error) === 'keep' && user.value) {
        // Run on the cached profile; the api client recovers the token on the
        // next successful request once the server is back.
        offline.value = true
      } else {
        clearSession()
      }
    }
  }

  /**
   * Switches language and, when there is someone to remember it for, stores the
   * choice on the account. Applied locally first so the UI never waits on the
   * network, and the local value stands even if the request fails — the next
   * successful `getMe()` is what would put the two back in step.
   */
  async function changeLocale(locale: Locale) {
    setLocale(locale)
    if (!accessToken.value) return

    const profile = await authApi.updateLocale(locale)
    user.value = profile
    localStorage.setItem(USER_KEY, JSON.stringify(profile))
  }

  /** Runs initialize() at most once per page load; safe to await repeatedly. */
  function ensureInitialized(): Promise<void> {
    initPromise ??= initialize()
    return initPromise
  }

  return {
    user,
    accessToken,
    offline,
    isAuthenticated,
    isAdmin,
    login,
    register,
    logout,
    clearSession,
    refreshToken,
    changeLocale,
    initialize,
    ensureInitialized,
  }
})
