import { api } from './client'
import type { TaskType } from '../types'

export interface NotificationTime {
  hour: number
  minute: number
}

export interface MergedSchedule {
  taskType: TaskType
  intervalDays: number
  /**
   * The time this plant pins for everyone, or null when each collaborator is
   * reminded whenever they asked to be.
   */
  hour: number | null
  minute: number | null
  isOverride: boolean
  enabled: boolean
}

/** A user's own reminder times: a base one, refined per task type. */
export interface UserNotificationTimes {
  base: NotificationTime
  overrides: Partial<Record<TaskType, NotificationTime>>
}

export const schedulesApi = {
  getForPlant(plantId: string): Promise<MergedSchedule[]> {
    return api.get(`/api/plants/${plantId}/schedules`)
  },

  setPlantSchedule(
    plantId: string,
    taskType: TaskType,
    // A null hour clears the pinned time, handing each collaborator back their
    // own preference. `enabled: false` takes the task type off this plant's
    // rotation and discards whatever it had queued; omitting it changes nothing.
    data: {
      intervalDays: number
      hour: number | null
      minute: number | null
      enabled?: boolean
    },
  ): Promise<void> {
    return api.put(`/api/plants/${plantId}/schedules/${taskType}`, data)
  },

  removePlantSchedule(plantId: string, taskType: TaskType): Promise<void> {
    return api.delete(`/api/plants/${plantId}/schedules/${taskType}`)
  },

  getMyNotificationTimes(): Promise<UserNotificationTimes> {
    return api.get('/api/me/notification-times')
  },

  setMyBaseTime(data: NotificationTime): Promise<UserNotificationTimes> {
    return api.put('/api/me/notification-times', data)
  },

  /** A null hour drops the override, falling back to the base time. */
  setMyTaskTime(
    taskType: TaskType,
    data: { hour: number | null; minute: number | null },
  ): Promise<UserNotificationTimes> {
    return api.put(`/api/me/notification-times/${taskType}`, data)
  },
}
