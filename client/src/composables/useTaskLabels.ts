import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Task, TaskType } from '../types'
import type { DayLabel, DayMarker } from '../utils/agenda'
import {
  relativeDateMessage,
  taskStatusKey,
  taskTypeKey,
} from '../utils/date'

/**
 * Renders the descriptors that `utils/date.ts` and `utils/agenda.ts` produce.
 *
 * Those modules stay pure so they can be unit-tested without an i18n instance;
 * this is the single place that knows how to turn their output into words, so
 * components never have to reason about plural forms or date formats.
 */
export function useTaskLabels() {
  const { t, d, locale } = useI18n()

  /** "A, B and C" the way the active language writes a list — Spanish uses
   *  "y" and Basque "eta", so a hardcoded join would read as English. */
  const listFormatter = computed(() => new Intl.ListFormat(locale.value, { style: 'long' }))

  /** "Due today", "Overdue by 3 days", … */
  function relativeDate(dueAt: string): string {
    const message = relativeDateMessage(dueAt)
    return message.count === undefined
      ? t(message.key)
      : t(message.key, { count: message.count }, message.count)
  }

  function taskType(type: TaskType): string {
    return t(taskTypeKey(type))
  }

  function taskStatus(task: Pick<Task, 'status' | 'dueAt'>): string {
    return t(taskStatusKey(task))
  }

  /** The time of day a task is due, in the active locale's clock convention. */
  function dueTime(dueAt: string): string {
    return d(new Date(dueAt), 'time')
  }

  /** "Today" / "Tomorrow" / "Wed, 5 Aug" — see `DayLabel`. */
  function dayHeading(label: DayLabel): string {
    if (label.kind !== 'date') return t(`date.${label.kind}`)
    return d(label.date, label.sameYear ? 'weekdayShort' : 'weekdayShortWithYear')
  }

  /** "Monstera and Ficus" — the plants behind one calendar marker. */
  function markerPlants(marker: DayMarker): string {
    return listFormatter.value.format(marker.plants)
  }

  function monthHeading(month: Date): string {
    return d(month, 'monthYear')
  }

  /**
   * Monday-first weekday headers for the calendar grid, derived from the
   * locale rather than hardcoded — the grid stays Monday-first, but the names
   * have to come from Intl or they read as English in every language.
   */
  function weekdayNames(): string[] {
    // 2024-01-01 was a Monday; any known Monday works as the anchor.
    const monday = new Date(2024, 0, 1)
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(monday)
      day.setDate(monday.getDate() + i)
      return d(day, 'weekday')
    })
  }

  return {
    relativeDate,
    taskType,
    taskStatus,
    dueTime,
    dayHeading,
    markerPlants,
    monthHeading,
    weekdayNames,
  }
}
