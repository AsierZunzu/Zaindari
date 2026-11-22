import { api } from './client'
import type { User, RegisterData } from '../types'

interface AuthResponse {
  accessToken: string
  user: User
}

interface RefreshResponse {
  accessToken: string
}

export interface OidcStatus {
  enabled: boolean
  name: string | null
}

export const authApi = {
  login(username: string, password: string): Promise<AuthResponse> {
    return api.post('/api/auth/login', { username, password })
  },

  register(data: RegisterData): Promise<AuthResponse> {
    return api.post('/api/auth/register', data)
  },

  refreshToken(): Promise<RefreshResponse> {
    return api.post('/api/auth/refresh')
  },

  oidcStatus(): Promise<OidcStatus> {
    return api.get('/api/auth/oidc/status')
  },

  /** Also sets the short-lived cookie the callback checks the attempt against. */
  oidcStart(): Promise<{ url: string }> {
    return api.get('/api/auth/oidc')
  },

  logout(): Promise<void> {
    return api.post('/api/auth/logout')
  },

  getMe(): Promise<User> {
    return api.get('/api/me')
  },

  updateLocale(locale: string): Promise<User> {
    return api.patch('/api/me', { locale })
  },
}
