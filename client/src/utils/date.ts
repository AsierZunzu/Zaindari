import type { TaskType } from '../types'

export function formatRelativeDate(date: string): string {
  const now = new Date()
  const due = new Date(date)
  const diffMs = due.getTime() - now.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < -1) return `Overdue by ${Math.abs(diffDays)} days`
  if (diffDays === -1) return 'Overdue by 1 day'
  if (diffDays === 0) return 'Due today'
  if (diffDays === 1) return 'Due tomorrow'
  return `Due in ${diffDays} days`
}

export function isOverdue(date: string): boolean {
  const now = new Date()
  const due = new Date(date)
  return due.getTime() < now.getTime() && !isDueToday(date)
}

export function isDueToday(date: string): boolean {
  const now = new Date()
  const due = new Date(date)
  return (
    due.getFullYear() === now.getFullYear() &&
    due.getMonth() === now.getMonth() &&
    due.getDate() === now.getDate()
  )
}

export function formatTaskType(type: TaskType): string {
  const labels: Record<TaskType, string> = {
    watering: 'Watering',
    fertilization: 'Fertilization',
    misting: 'Misting',
    repotting: 'Repotting',
  }
  return labels[type]
}

export function taskTypeEmoji(type: TaskType): string {
  const emojis: Record<TaskType, string> = {
    watering: '\u{1F4A7}',
    fertilization: '\u{1F331}',
    misting: '\u{1F4A8}',
    repotting: '\u{1FAB4}',
  }
  return emojis[type]
}
