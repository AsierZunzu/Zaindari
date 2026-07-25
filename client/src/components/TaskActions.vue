<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { tasksApi } from '../api/tasks'
import type { Task } from '../types'

const { t } = useI18n()

const props = defineProps<{
  task: Task
}>()

const emit = defineEmits<{
  'task-updated': [task: Task]
}>()

const showSnooze = ref(false)
const acting = ref(false)

/**
 * One row of buttons, two server actions. A fixed lapse holds this same task
 * back (snooze); "next scheduled" gives up on this occurrence and lets the
 * schedule resume one interval out, which is what skipping already does.
 *
 * Durations, not labels: "3d" is not how every language abbreviates three
 * days, so the label is rendered from `tasks.snoozeDays`.
 */
const snoozeOptions = [
  { key: 'd1', action: 'snooze', hours: 24, days: 1 },
  { key: 'd3', action: 'snooze', hours: 72, days: 3 },
  { key: 'next', action: 'skip' },
] as const

type SnoozeOption = (typeof snoozeOptions)[number]

function optionLabel(opt: SnoozeOption) {
  return opt.action === 'snooze'
    ? t('tasks.snoozeDays', { count: opt.days }, opt.days)
    : t('tasks.snoozeNextScheduled')
}

async function completeTask() {
  if (acting.value) return
  acting.value = true
  try {
    const updated = await tasksApi.complete(props.task.id)
    emit('task-updated', updated)
  } catch {
    // error handling could be enhanced
  } finally {
    acting.value = false
  }
}

async function undoTask() {
  if (acting.value) return
  acting.value = true
  try {
    const updated = await tasksApi.undo(props.task.id)
    emit('task-updated', updated)
  } catch {
    // error handling could be enhanced
  } finally {
    acting.value = false
  }
}

async function snoozeTask(opt: SnoozeOption) {
  if (acting.value) return
  acting.value = true
  try {
    const updated =
      opt.action === 'snooze'
        ? await tasksApi.snooze(props.task.id, opt.hours)
        : await tasksApi.skip(props.task.id)
    showSnooze.value = false
    emit('task-updated', updated)
  } catch {
    // error handling could be enhanced
  } finally {
    acting.value = false
  }
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-1.5">
    <!-- Complete button (for pending/snoozed) -->
    <button
      v-if="task.status === 'pending' || task.status === 'snoozed'"
      class="inline-flex items-center justify-center rounded-md bg-green-50 p-1.5 text-green-600 transition-colors hover:bg-green-100 disabled:opacity-50"
      :title="$t('tasks.complete')"
      :disabled="acting"
      @click="completeTask"
    >
      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
      </svg>
    </button>

    <!-- Snooze button (for pending/snoozed) -->
    <button
      v-if="task.status === 'pending' || task.status === 'snoozed'"
      class="inline-flex items-center justify-center rounded-md bg-yellow-50 p-1.5 text-yellow-600 transition-colors hover:bg-yellow-100"
      :title="$t('tasks.snooze')"
      @click="showSnooze = !showSnooze"
    >
      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </button>

    <!-- Undo button (for done) -->
    <button
      v-if="task.status === 'done'"
      class="inline-flex items-center justify-center rounded-md bg-blue-50 p-1.5 text-blue-600 transition-colors hover:bg-blue-100 disabled:opacity-50"
      :title="$t('tasks.undo')"
      :disabled="acting"
      @click="undoTask"
    >
      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a5 5 0 015 5v2M3 10l4-4m-4 4l4 4" />
      </svg>
    </button>

    <!-- Snooze picker -->
    <div v-if="showSnooze" class="flex w-full items-center gap-1 pt-1">
      <button
        v-for="opt in snoozeOptions"
        :key="opt.key"
        class="rounded-md border border-yellow-200 bg-yellow-50 px-2 py-1 text-xs font-medium text-yellow-700 transition-colors hover:bg-yellow-100 disabled:opacity-50"
        :disabled="acting"
        @click="snoozeTask(opt)"
      >
        {{ optionLabel(opt) }}
      </button>
    </div>
  </div>
</template>
