import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '../auth'
import { ApiError, NetworkError } from '../../api/client'
import { authApi } from '../../api/auth'

vi.mock('../../api/auth', () => ({
  authApi: {
    login: vi.fn(),
    register: vi.fn(),
    refreshToken: vi.fn(),
    logout: vi.fn(),
    getMe: vi.fn(),
  },
}))

const mockUser = {
  id: 'user-1',
  username: 'testuser',
  displayName: 'Test User',
  email: 'test@example.com',
  isAdmin: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

/** Seeds a session as it would look after a previous successful login. */
function seedStoredSession() {
  localStorage.setItem('accessToken', 'stored-token')
  localStorage.setItem('authUser', JSON.stringify(mockUser))
}

describe('auth store', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  describe('initialize', () => {
    it('revalidates the session against the server', async () => {
      seedStoredSession()
      vi.mocked(authApi.getMe).mockResolvedValue(mockUser as never)

      const auth = useAuthStore()
      await auth.initialize()

      expect(auth.isAuthenticated).toBe(true)
      expect(auth.offline).toBe(false)
    })

    it('keeps the session when the server is unreachable', async () => {
      seedStoredSession()
      vi.mocked(authApi.getMe).mockRejectedValue(new NetworkError())

      const auth = useAuthStore()
      await auth.initialize()

      expect(localStorage.getItem('accessToken')).toBe('stored-token')
      expect(auth.offline).toBe(true)
      // Critically, the router guard must still let the user through.
      expect(auth.isAuthenticated).toBe(true)
    })

    it('keeps the session on a 502 from a restarting backend', async () => {
      seedStoredSession()
      vi.mocked(authApi.getMe).mockRejectedValue(new ApiError(502, 'Bad Gateway'))

      const auth = useAuthStore()
      await auth.initialize()

      expect(auth.isAuthenticated).toBe(true)
      expect(auth.offline).toBe(true)
    })

    it('clears the session when the server rejects the token', async () => {
      seedStoredSession()
      vi.mocked(authApi.getMe).mockRejectedValue(new ApiError(401, 'Unauthorized'))

      const auth = useAuthStore()
      await auth.initialize()

      expect(localStorage.getItem('accessToken')).toBeNull()
      expect(localStorage.getItem('authUser')).toBeNull()
      expect(auth.isAuthenticated).toBe(false)
    })

    it('clears the session when unreachable but no cached profile exists', async () => {
      localStorage.setItem('accessToken', 'stored-token')
      vi.mocked(authApi.getMe).mockRejectedValue(new NetworkError())

      const auth = useAuthStore()
      await auth.initialize()

      expect(auth.isAuthenticated).toBe(false)
      expect(localStorage.getItem('accessToken')).toBeNull()
    })

    it('does nothing when there is no stored token', async () => {
      const auth = useAuthStore()
      await auth.initialize()

      expect(authApi.getMe).not.toHaveBeenCalled()
    })

    it('adopts a token rotated by the api client during getMe', async () => {
      seedStoredSession()
      vi.mocked(authApi.getMe).mockImplementation(async () => {
        localStorage.setItem('accessToken', 'rotated-token')
        return mockUser as never
      })

      const auth = useAuthStore()
      await auth.initialize()

      expect(auth.accessToken).toBe('rotated-token')
    })
  })

  describe('logout', () => {
    it('revokes server-side and wipes local state', async () => {
      seedStoredSession()
      vi.mocked(authApi.logout).mockResolvedValue()

      const auth = useAuthStore()
      await auth.logout()

      expect(authApi.logout).toHaveBeenCalled()
      expect(localStorage.getItem('accessToken')).toBeNull()
      expect(auth.isAuthenticated).toBe(false)
    })

    it('still logs out locally if the revoke call fails', async () => {
      seedStoredSession()
      vi.mocked(authApi.logout).mockRejectedValue(new NetworkError())

      const auth = useAuthStore()
      await auth.logout()

      expect(localStorage.getItem('accessToken')).toBeNull()
      expect(auth.isAuthenticated).toBe(false)
    })
  })
})
