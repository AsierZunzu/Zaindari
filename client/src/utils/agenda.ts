import type { TaskWithPlant } from '../types'

/**
 * Agenda and calendar grouping.
 *
 * Everything here works in the browser's local time zone. `dueAt` arrives as a
 * UTC instant, but "is this due today?" is a question about the user's calendar
 * day, not UTC's — a task due at 23:00 UTC is tomorrow's problem in Madrid.
 */

/**
 * How a day heading should read. Not a string: "Today" is a translation key
 * while an explicit date is a job for `Intl`, and only the view layer knows
 * which locale to render either one in. `composables/useTaskLabels.ts` turns
 * this into text.
 */
export type DayLabel =
  | { kind: 'today' | 'tomorrow' | 'yesterday' }
  | { kind: 'date'; date: Date; sameYear: boolean }

export interface AgendaDay {
  /** Local calendar day, `YYYY-MM-DD`. Stable key for lists and lookups. */
  key: string
  date: Date
  label: DayLabel
  tasks: TaskWithPlant[]
}

export interface AgendaSection {
  /** Doubles as the translation key suffix — see `agenda.*` in the catalogs. */
  id: 'overdue' | 'upcoming' | 'completed'
  days: AgendaDay[]
}

const ACTIVE_STATUSES = ['pending', 'snoozed'] as const

export function isActive(task: TaskWithPlant): boolean {
  return (ACTIVE_STATUSES as readonly string[]).includes(task.status)
}

export function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/** `YYYY-MM-DD` in local time. Deliberately not `toISOString`, which is UTC. */
export function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function sameDay(a: Date, b: Date): boolean {
  return dayKey(a) === dayKey(b)
}

/** "Today" / "Tomorrow" / "Yesterday" where it helps, an explicit date otherwise. */
export function dayLabel(date: Date, now: Date = new Date()): DayLabel {
  const today = startOfDay(now)
  const diffDays = Math.round((startOfDay(date).getTime() - today.getTime()) / 86_400_000)

  if (diffDays === 0) return { kind: 'today' }
  if (diffDays === 1) return { kind: 'tomorrow' }
  if (diffDays === -1) return { kind: 'yesterday' }

  // The year is only worth the space when it is not the current one.
  return {
    kind: 'date',
    date,
    sameYear: date.getFullYear() === now.getFullYear(),
  }
}

/**
 * Buckets tasks into day groups keyed by local calendar day.
 * `order` decides whether the earliest or the most recent day comes first —
 * upcoming work reads forwards, history reads backwards.
 */
export function groupByDay(
  tasks: TaskWithPlant[],
  now: Date = new Date(),
  order: 'asc' | 'desc' = 'asc',
): AgendaDay[] {
  const days = new Map<string, AgendaDay>()

  for (const task of tasks) {
    const due = new Date(task.dueAt)
    const key = dayKey(due)
    let day = days.get(key)
    if (!day) {
      day = { key, date: startOfDay(due), label: dayLabel(due, now), tasks: [] }
      days.set(key, day)
    }
    day.tasks.push(task)
  }

  const sorted = [...days.values()].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  )
  if (order === 'desc') sorted.reverse()

  for (const day of sorted) {
    day.tasks.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
  }

  return sorted
}

/**
 * Splits the feed into the three things a plant owner actually wants to know:
 * what I'm late on, what's coming, and what I've just done.
 *
 * Overdue is separated out rather than left in its calendar day because late
 * work is a single backlog, not a history — a plant that needed water on Monday
 * still needs water now, and burying it under a "Mon, 20 Jul" heading two
 * screens up would read as something that already passed.
 */
export function buildAgenda(
  tasks: TaskWithPlant[],
  now: Date = new Date(),
): AgendaSection[] {
  const today = startOfDay(now)

  const overdue: TaskWithPlant[] = []
  const upcoming: TaskWithPlant[] = []
  const completed: TaskWithPlant[] = []

  for (const task of tasks) {
    if (!isActive(task)) {
      completed.push(task)
    } else if (startOfDay(new Date(task.dueAt)).getTime() < today.getTime()) {
      overdue.push(task)
    } else {
      upcoming.push(task)
    }
  }

  const sections: AgendaSection[] = []

  if (overdue.length) {
    sections.push({ id: 'overdue', days: groupByDay(overdue, now, 'desc') })
  }

  sections.push({ id: 'upcoming', days: groupByDay(upcoming, now, 'asc') })

  if (completed.length) {
    sections.push({ id: 'completed', days: groupByDay(completed, now, 'desc') })
  }

  return sections
}

export interface CalendarCell {
  key: string
  date: Date
  inMonth: boolean
  isToday: boolean
  tasks: TaskWithPlant[]
}

/**
 * A Monday-first month grid of whole weeks, so every row has seven cells and
 * the leading/trailing days of the neighbouring months fill the gaps.
 */
export function buildMonthGrid(
  anchor: Date,
  tasks: TaskWithPlant[] = [],
  now: Date = new Date(),
): CalendarCell[][] {
  const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  // getDay() is Sunday-first; shift so Monday === 0.
  const leadingDays = (firstOfMonth.getDay() + 6) % 7
  const gridStart = addDays(firstOfMonth, -leadingDays)

  const lastOfMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
  const trailingDays = (7 - ((lastOfMonth.getDay() + 6) % 7) - 1) % 7
  const totalDays = leadingDays + lastOfMonth.getDate() + trailingDays

  const byDay = new Map<string, TaskWithPlant[]>()
  for (const task of tasks) {
    const key = dayKey(new Date(task.dueAt))
    const bucket = byDay.get(key)
    if (bucket) bucket.push(task)
    else byDay.set(key, [task])
  }

  const weeks: CalendarCell[][] = []
  for (let i = 0; i < totalDays; i += 7) {
    const week: CalendarCell[] = []
    for (let d = 0; d < 7; d++) {
      const date = addDays(gridStart, i + d)
      const key = dayKey(date)
      week.push({
        key,
        date,
        inMonth: date.getMonth() === anchor.getMonth(),
        isToday: sameDay(date, now),
        tasks: (byDay.get(key) ?? []).sort(
          (a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime(),
        ),
      })
    }
    weeks.push(week)
  }

  return weeks
}

/** Bounds of the month grid, so the feed can be fetched for exactly what's shown. */
export function monthRange(anchor: Date): { from: Date; to: Date } {
  const grid = buildMonthGrid(anchor)
  const from = grid[0][0].date
  const lastWeek = grid[grid.length - 1]
  const to = new Date(lastWeek[6].date)
  to.setHours(23, 59, 59, 999)
  return { from, to }
}
