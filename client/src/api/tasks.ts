import { api } from './client'
import type { Task, TaskStatus, TaskType, TaskWithPlant } from '../types'

export interface TaskFeedParams {
  from?: Date
  to?: Date
  statuses?: TaskStatus[]
  /** Also pull in pending/snoozed tasks that fell due before `from`. */
  includeOverdue?: boolean
}

export const tasksApi = {
  /** Tasks across every plant the user can see, for the agenda and calendar. */
  list(params: TaskFeedParams = {}): Promise<TaskWithPlant[]> {
    const searchParams = new URLSearchParams()
    if (params.from) searchParams.set('from', params.from.toISOString())
    if (params.to) searchParams.set('to', params.to.toISOString())
    if (params.statuses?.length) searchParams.set('status', params.statuses.join(','))
    if (params.includeOverdue) searchParams.set('includeOverdue', 'true')
    const query = searchParams.toString()
    return api.get(`/api/tasks${query ? `?${query}` : ''}`)
  },

  getForPlant(plantId: string, params?: { status?: string; limit?: number }): Promise<Task[]> {
    const searchParams = new URLSearchParams()
    if (params?.status) searchParams.set('status', params.status)
    if (params?.limit) searchParams.set('limit', String(params.limit))
    const query = searchParams.toString()
    return api.get(`/api/plants/${plantId}/tasks${query ? `?${query}` : ''}`)
  },

  /** Completes one specific task. Used wherever the user acted on a task they
   *  can see, so a click on a future task does not close out an older one. */
  complete(taskId: string): Promise<Task> {
    return api.post(`/api/tasks/${taskId}/complete`)
  },

  /** Marks a plant's chore done without a task to point at — the "I just
   *  watered it" shortcut, which creates the task if none was pending. */
  completeByType(plantId: string, taskType: TaskType): Promise<Task> {
    return api.post(`/api/plants/${plantId}/tasks/${taskType}/complete`)
  },

  undo(taskId: string): Promise<Task> {
    return api.post(`/api/tasks/${taskId}/undo`)
  },

  snooze(taskId: string, hours: number): Promise<Task> {
    return api.post(`/api/tasks/${taskId}/snooze`, { hours })
  },

  /** Gives up on this occurrence: the server schedules the next one an
   *  interval out. Offered as the last of the snooze lapses. */
  skip(taskId: string): Promise<Task> {
    return api.post(`/api/tasks/${taskId}/skip`)
  },
}
