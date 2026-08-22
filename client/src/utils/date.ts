import type { Task, TaskType } from '../types'
import type { IconName } from '../components/icons'

/**
 * These helpers stay pure and locale-agnostic on purpose: they answer
 * "*what* should this say?", not "*how* does that read in Basque?". They return
 * a translation key (plus whatever the sentence needs to interpolate) and
 * `composables/useTaskLabels.ts` renders it.
 *
 * The alternative — passing `t` in — would make every one of them untestable
 * without an i18n instance, and would scatter wording decisions across files
 * that are really about dates.
 */

export interface MessageRef {
  key: string
  /** Plural count, when the message has singular/plural forms. */
  count?: number
}

/** "Due today" / "Overdue by 3 days" / … as a key, not as English. */
export function relativeDateMessage(date: string): MessageRef {
  const now = new Date()
  const due = new Date(date)
  const diffMs = due.getTime() - now.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    return { key: 'date.overdueByDays', count: Math.abs(diffDays) }
  }
  if (diffDays === 0) return { key: 'date.dueToday' }
  if (diffDays === 1) return { key: 'date.dueTomorrow' }
  return { key: 'date.dueInDays', count: diffDays }
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

export function taskTypeKey(type: TaskType): string {
  return `taskType.${type}`
}

/**
 * The badge a task shows. `pending` has no badge of its own — what the user
 * cares about is whether it is late, due today, or still ahead.
 */
export function taskStatusKey(task: Pick<Task, 'status' | 'dueAt'>): string {
  if (task.status === 'done') return 'taskStatus.done'
  if (task.status === 'skipped') return 'taskStatus.skipped'
  if (task.status === 'snoozed') return 'taskStatus.snoozed'
  if (isOverdue(task.dueAt)) return 'taskStatus.overdue'
  if (isDueToday(task.dueAt)) return 'taskStatus.today'
  return 'taskStatus.upcoming'
}

/**
 * The icon a task type is drawn with. Like the key-returning helpers above, it
 * answers "*which* icon?" and leaves the drawing to `AppIcon`; the import is
 * type-only, so this module still has no runtime dependency on a component.
 */
export function taskTypeIcon(type: TaskType): IconName {
  const icons: Record<TaskType, IconName> = {
    watering: 'watering',
    fertilization: 'fertilization',
    misting: 'misting',
    repotting: 'repotting',
  }
  return icons[type]
}
