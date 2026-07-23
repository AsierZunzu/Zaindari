import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { tasksApi } from '../api/tasks'
import type { Task, TaskStatus, TaskWithPlant } from '../types'
import { addDays, buildAgenda, monthRange, startOfDay } from '../utils/agenda'

/** Statuses the Tasks page shows: outstanding work plus a short tail of history. */
const FEED_STATUSES: TaskStatus[] = ['pending', 'snoozed', 'done', 'skipped']

/** How far back completed tasks stay interesting on the agenda. */
const HISTORY_DAYS = 14
/** How far ahead the agenda looks before it stops being a plan and starts being noise. */
const HORIZON_DAYS = 60

export const useTasksStore = defineStore('tasks', () => {
  const tasks = ref<TaskWithPlant[]>([])
  const loading = ref(false)
  const error = ref('')

  const agenda = computed(() => buildAgenda(tasks.value))

  async function load(params: Parameters<typeof tasksApi.list>[0]) {
    loading.value = true
    error.value = ''
    try {
      tasks.value = await tasksApi.list({ statuses: FEED_STATUSES, ...params })
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Failed to load tasks'
    } finally {
      loading.value = false
    }
  }

  /** The agenda window: recent history behind, the planning horizon ahead, and
   *  every outstanding task however old. */
  function fetchAgenda(now: Date = new Date()) {
    const today = startOfDay(now)
    return load({
      from: addDays(today, -HISTORY_DAYS),
      to: addDays(today, HORIZON_DAYS),
      includeOverdue: true,
    })
  }

  /** Exactly the days the month grid draws, so paging months refetches. */
  function fetchMonth(anchor: Date) {
    return load(monthRange(anchor))
  }

  /**
   * Folds a mutated task back into the feed. Completing or skipping spawns the
   * next occurrence server-side, so the caller still reloads — this just keeps
   * the row from flickering back to its old state in the meantime.
   */
  function applyUpdate(updated: Task) {
    const index = tasks.value.findIndex((t) => t.id === updated.id)
    if (index !== -1) {
      tasks.value[index] = { ...tasks.value[index], ...updated }
    }
  }

  return { tasks, loading, error, agenda, fetchAgenda, fetchMonth, applyUpdate }
})
