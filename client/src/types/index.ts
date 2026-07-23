export interface User {
  id: string
  username: string
  displayName: string
  email: string | null
  isAdmin: boolean
  /** One of `SUPPORTED_LOCALES`; the server validates it before storing. */
  locale: string
}

export interface Plant {
  id: string
  name: string
  location: string | null
  instructions: string | null
  ownerId: string
  createdAt: string
  updatedAt: string
}

export interface PlantImage {
  id: string
  plantId: string
  filePath: string
  isCurrent: boolean
  createdAt: string
}

export type TaskType = 'watering' | 'fertilization' | 'misting' | 'repotting'
export type TaskStatus = 'pending' | 'done' | 'snoozed' | 'skipped'

export interface Task {
  id: string
  plantId: string
  taskType: TaskType
  status: TaskStatus
  dueAt: string
  completedAt: string | null
  completedBy: string | null
  snoozeUntil: string | null
  skipReason: string | null
}

/** A task as returned by the cross-plant `/api/tasks` feed, which the agenda and
 *  calendar render — they need the plant's name to label a row. */
export interface TaskWithPlant extends Task {
  plant: {
    id: string
    name: string
    location: string | null
  }
}

export interface Schedule {
  id: string
  taskType: TaskType
  intervalDays: number
  hour: number
  minute: number
}

export interface PlantSchedule extends Schedule {
  plantId: string
  enabled: boolean
}

export interface DashboardPlant {
  plant: Plant
  currentImage: PlantImage | null
  pendingTasks: Task[]
  upcomingTasks: Task[]
}

export interface RegisterData {
  username: string
  displayName: string
  email?: string
  password: string
}
