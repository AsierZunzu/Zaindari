import { api } from './client'
import type { Task, TaskType } from '../types'

export const tasksApi = {
  getForPlant(plantId: string, params?: { status?: string; limit?: number }): Promise<Task[]> {
    const searchParams = new URLSearchParams()
    if (params?.status) searchParams.set('status', params.status)
    if (params?.limit) searchParams.set('limit', String(params.limit))
    const query = searchParams.toString()
    return api.get(`/api/plants/${plantId}/tasks${query ? `?${query}` : ''}`)
  },

  completeByType(plantId: string, taskType: TaskType): Promise<Task> {
    return api.post(`/api/plants/${plantId}/tasks/complete`, { taskType })
  },

  undo(taskId: string): Promise<Task> {
    return api.post(`/api/tasks/${taskId}/undo`)
  },

  snooze(taskId: string, hours: number): Promise<Task> {
    return api.post(`/api/tasks/${taskId}/snooze`, { hours })
  },

  skip(taskId: string, reason: string): Promise<Task> {
    return api.post(`/api/tasks/${taskId}/skip`, { reason })
  },
}
