import { api } from './client'
import type { DashboardPlant } from '../types'

export const dashboardApi = {
  get(): Promise<DashboardPlant[]> {
    return api.get('/api/dashboard')
  },
}
