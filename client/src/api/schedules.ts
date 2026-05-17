import { api } from './client'
import type { TaskType } from '../types'

export interface MergedSchedule {
  taskType: TaskType
  intervalDays: number
  hour: number
  minute: number
  isOverride: boolean
  enabled: boolean
}

export const schedulesApi = {
  getForPlant(plantId: string): Promise<MergedSchedule[]> {
    return api.get(`/api/plants/${plantId}/schedules`)
  },

  setPlantSchedule(
    plantId: string,
    taskType: TaskType,
    data: { intervalDays: number; hour: number; minute: number },
  ): Promise<void> {
    return api.put(`/api/plants/${plantId}/schedules/${taskType}`, data)
  },

  removePlantSchedule(plantId: string, taskType: TaskType): Promise<void> {
    return api.delete(`/api/plants/${plantId}/schedules/${taskType}`)
  },
}
