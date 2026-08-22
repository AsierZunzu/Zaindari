<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { tasksApi } from '../api/tasks'
import type { Task } from '../types'
import AppIcon from './AppIcon.vue'

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
    <!--
      Icon-only, because the row is dense and these three verbs are drawn
      unambiguously. Each button borrows its own status tone on hover rather
      than owning a permanent fill — at rest the row stays paper, and colour
      appears only where the pointer is.
    -->
    <button
      v-if="task.status === 'pending' || task.status === 'snoozed'"
      class="inline-flex items-center justify-center rounded-md border border-line bg-surface p-1.5 text-done transition-colors hover:bg-done-soft disabled:opacity-50"
      :title="$t('tasks.complete')"
      :aria-label="$t('tasks.complete')"
      :disabled="acting"
      @click="completeTask"
    >
      <AppIcon name="check" :size="16" />
    </button>

    <button
      v-if="task.status === 'pending' || task.status === 'snoozed'"
      class="inline-flex items-center justify-center rounded-md border border-line bg-surface p-1.5 text-due-ink transition-colors hover:bg-due-soft"
      :title="$t('tasks.snooze')"
      :aria-label="$t('tasks.snooze')"
      :aria-expanded="showSnooze"
      @click="showSnooze = !showSnooze"
    >
      <AppIcon name="clock" :size="16" />
    </button>

    <!-- Undo is neither good news nor bad, so it stays ink: the palette keeps
         one accent, and a blue button here was the app's only stray. -->
    <button
      v-if="task.status === 'done'"
      class="inline-flex items-center justify-center rounded-md border border-line bg-surface p-1.5 text-ink-muted transition-colors hover:bg-surface-sunk disabled:opacity-50"
      :title="$t('tasks.undo')"
      :aria-label="$t('tasks.undo')"
      :disabled="acting"
      @click="undoTask"
    >
      <AppIcon name="undo" :size="16" />
    </button>

    <div v-if="showSnooze" class="flex w-full flex-wrap items-center gap-1 pt-1">
      <button
        v-for="opt in snoozeOptions"
        :key="opt.key"
        class="rounded-sm border border-line bg-due-soft px-2 py-1 text-xs font-semibold text-due-ink transition-colors hover:border-due disabled:opacity-50"
        :disabled="acting"
        @click="snoozeTask(opt)"
      >
        {{ optionLabel(opt) }}
      </button>
    </div>
  </div>
</template>
