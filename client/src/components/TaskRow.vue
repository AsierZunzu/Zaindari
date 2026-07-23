<script setup lang="ts">
import { computed } from 'vue'
import type { Task, TaskWithPlant } from '../types'
import { formatRelativeDate, formatTaskType, taskTypeEmoji, isOverdue, isDueToday } from '../utils/date'
import TaskActions from './TaskActions.vue'

const props = defineProps<{
  task: TaskWithPlant
}>()

defineEmits<{
  'task-updated': [task: Task]
}>()

function badgeClass(): string {
  if (props.task.status === 'done') return 'bg-green-100 text-green-700'
  if (props.task.status === 'skipped') return 'bg-gray-100 text-gray-600'
  if (props.task.status === 'snoozed') return 'bg-yellow-100 text-yellow-700'
  if (isOverdue(props.task.dueAt)) return 'bg-red-100 text-red-700'
  if (isDueToday(props.task.dueAt)) return 'bg-yellow-100 text-yellow-700'
  return 'bg-gray-100 text-gray-600'
}

function badgeLabel(): string {
  if (props.task.status === 'done') return 'Done'
  if (props.task.status === 'skipped') return 'Skipped'
  if (props.task.status === 'snoozed') return 'Snoozed'
  if (isOverdue(props.task.dueAt)) return 'Overdue'
  if (isDueToday(props.task.dueAt)) return 'Today'
  return 'Upcoming'
}

function dueTime(): string {
  return new Date(props.task.dueAt).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Done and skipped tasks are struck through and dimmed. Must stay reactive:
 *  the row is keyed by task id, so completing one updates the prop in place
 *  rather than remounting the component. */
const settled = computed(
  () => props.task.status === 'done' || props.task.status === 'skipped',
)
</script>

<template>
  <div
    class="rounded-lg bg-white p-3 shadow-sm ring-1 ring-gray-100"
    :class="settled ? 'opacity-70' : ''"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="flex min-w-0 items-center gap-2">
        <span class="text-lg">{{ taskTypeEmoji(task.taskType) }}</span>
        <div class="min-w-0">
          <p
            class="truncate text-sm font-medium text-gray-900"
            :class="settled ? 'line-through' : ''"
          >
            {{ formatTaskType(task.taskType) }}
          </p>
          <RouterLink
            :to="`/plants/${task.plant.id}`"
            class="block truncate text-xs text-primary-700 hover:underline"
          >
            {{ task.plant.name }}<span v-if="task.plant.location" class="text-gray-400">
              &middot; {{ task.plant.location }}</span>
          </RouterLink>
          <p class="text-xs text-gray-500">{{ dueTime() }} &middot; {{ formatRelativeDate(task.dueAt) }}</p>
          <p v-if="task.skipReason" class="text-xs italic text-gray-400">{{ task.skipReason }}</p>
        </div>
      </div>
      <span
        class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
        :class="badgeClass()"
      >
        {{ badgeLabel() }}
      </span>
    </div>
    <div v-if="task.status !== 'skipped'" class="mt-2">
      <TaskActions :task="task" @task-updated="$emit('task-updated', $event)" />
    </div>
  </div>
</template>
