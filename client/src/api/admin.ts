import { api } from './client'
import type { User } from '../types'

// ── Users ──────────────────────────────────────────────────────────

export interface AdminUser extends User {
  oidcSubject: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateUserData {
  username: string
  password: string
  displayName: string
  email?: string
  isAdmin?: boolean
}

export interface UpdateUserData {
  displayName?: string
  email?: string
  isAdmin?: boolean
  password?: string
}

// ── App Config ─────────────────────────────────────────────────────

export interface AppConfigEntry {
  key: string
  value: string
  updatedAt: string
}

// ── Default Schedules ──────────────────────────────────────────────

/** Interval only — reminder times belong to each user, not to the task type. */
export interface DefaultSchedule {
  id: string
  taskType: string
  intervalDays: number
  updatedAt: string
}

// ── OIDC ───────────────────────────────────────────────────────────

export interface OidcConfig {
  id: string
  name: string
  issuerUrl: string
  clientId: string
  clientSecret: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface OidcConfigInput {
  name: string
  issuerUrl: string
  clientId: string
  clientSecret?: string
  enabled?: boolean
}

// ── API ────────────────────────────────────────────────────────────

export const adminApi = {
  // Users
  listUsers(): Promise<AdminUser[]> {
    return api.get('/api/admin/users')
  },

  createUser(data: CreateUserData): Promise<AdminUser> {
    return api.post('/api/admin/users', data)
  },

  updateUser(id: string, data: UpdateUserData): Promise<AdminUser> {
    return api.patch('/api/admin/users/' + id, data)
  },

  deleteUser(id: string): Promise<void> {
    return api.delete('/api/admin/users/' + id)
  },

  // App Config
  getConfig(): Promise<AppConfigEntry[]> {
    return api.get('/api/admin/config')
  },

  updateConfig(entries: Record<string, string>): Promise<AppConfigEntry[]> {
    return api.put('/api/admin/config', entries)
  },

  // Default Schedules
  getSchedules(): Promise<DefaultSchedule[]> {
    return api.get('/api/admin/schedules')
  },

  updateSchedule(
    taskType: string,
    data: { intervalDays?: number },
  ): Promise<DefaultSchedule> {
    return api.put('/api/admin/schedules/' + taskType, data)
  },

  // OIDC Config
  getOidcConfig(): Promise<OidcConfig | null> {
    return api.get('/api/admin/oidc')
  },

  upsertOidcConfig(data: OidcConfigInput): Promise<OidcConfig> {
    return api.put('/api/admin/oidc', data)
  },

  deleteOidcConfig(): Promise<void> {
    return api.delete('/api/admin/oidc')
  },
}
