<script setup lang="ts">
import { computed } from 'vue'
import type { Task } from '../types'
import { formatRelativeDate, formatTaskType, taskTypeEmoji, isOverdue, isDueToday } from '../utils/date'
import TaskActions from './TaskActions.vue'

const props = defineProps<{
  tasks: Task[]
  plantId: string
}>()

const emit = defineEmits<{
  'task-updated': [task: Task]
}>()

const groupedTasks = computed(() => {
  const pending = props.tasks.filter((t) => t.status === 'pending' || t.status === 'snoozed')
  const done = props.tasks.filter((t) => t.status === 'done')
  const skipped = props.tasks.filter((t) => t.status === 'skipped')
  return { pending, done, skipped }
})

function statusBadgeClass(task: Task): string {
  if (task.status === 'done') return 'bg-green-100 text-green-700'
  if (task.status === 'skipped') return 'bg-gray-100 text-gray-600'
  if (task.status === 'snoozed') return 'bg-yellow-100 text-yellow-700'
  // pending
  if (isOverdue(task.dueAt)) return 'bg-red-100 text-red-700'
  if (isDueToday(task.dueAt)) return 'bg-yellow-100 text-yellow-700'
  return 'bg-gray-100 text-gray-600'
}

function statusLabel(task: Task): string {
  if (task.status === 'done') return 'Done'
  if (task.status === 'skipped') return 'Skipped'
  if (task.status === 'snoozed') return 'Snoozed'
  if (isOverdue(task.dueAt)) return 'Overdue'
  if (isDueToday(task.dueAt)) return 'Today'
  return 'Upcoming'
}

function onTaskUpdated(task: Task) {
  emit('task-updated', task)
}
</script>

<template>
  <div class="space-y-4">
    <!-- Pending / Active tasks -->
    <div v-if="groupedTasks.pending.length > 0">
      <h3 class="mb-2 text-sm font-semibold text-gray-700">Pending Tasks</h3>
      <div class="space-y-2">
        <div
          v-for="task in groupedTasks.pending"
          :key="task.id"
          class="rounded-lg bg-white p-3 shadow-sm ring-1 ring-gray-100"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-2">
              <span class="text-lg">{{ taskTypeEmoji(task.taskType) }}</span>
              <div>
                <p class="text-sm font-medium text-gray-900">{{ formatTaskType(task.taskType) }}</p>
                <p class="text-xs text-gray-500">{{ formatRelativeDate(task.dueAt) }}</p>
              </div>
            </div>
            <span
              class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
              :class="statusBadgeClass(task)"
            >
              {{ statusLabel(task) }}
            </span>
          </div>
          <div class="mt-2">
            <TaskActions :task="task" :plant-id="plantId" @task-updated="onTaskUpdated" />
          </div>
        </div>
      </div>
    </div>

    <!-- No pending tasks -->
    <div
      v-if="groupedTasks.pending.length === 0 && groupedTasks.done.length === 0 && groupedTasks.skipped.length === 0"
      class="rounded-lg border-2 border-dashed border-gray-200 p-6 text-center"
    >
      <p class="text-sm text-gray-500">No tasks yet</p>
    </div>

    <!-- Recently completed -->
    <div v-if="groupedTasks.done.length > 0">
      <h3 class="mb-2 text-sm font-semibold text-gray-700">Recently Completed</h3>
      <div class="space-y-2">
        <div
          v-for="task in groupedTasks.done"
          :key="task.id"
          class="rounded-lg bg-white p-3 opacity-75 shadow-sm ring-1 ring-gray-100"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-2">
              <span class="text-lg">{{ taskTypeEmoji(task.taskType) }}</span>
              <div>
                <p class="text-sm font-medium text-gray-900 line-through">{{ formatTaskType(task.taskType) }}</p>
                <p class="text-xs text-gray-500">{{ formatRelativeDate(task.dueAt) }}</p>
              </div>
            </div>
            <span class="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
              Done
            </span>
          </div>
          <div class="mt-2">
            <TaskActions :task="task" :plant-id="plantId" @task-updated="onTaskUpdated" />
          </div>
        </div>
      </div>
    </div>

    <!-- Skipped -->
    <div v-if="groupedTasks.skipped.length > 0">
      <h3 class="mb-2 text-sm font-semibold text-gray-700">Skipped</h3>
      <div class="space-y-2">
        <div
          v-for="task in groupedTasks.skipped"
          :key="task.id"
          class="rounded-lg bg-white p-3 opacity-60 shadow-sm ring-1 ring-gray-100"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-2">
              <span class="text-lg">{{ taskTypeEmoji(task.taskType) }}</span>
              <div>
                <p class="text-sm font-medium text-gray-500">{{ formatTaskType(task.taskType) }}</p>
                <p v-if="task.skipReason" class="text-xs text-gray-400 italic">{{ task.skipReason }}</p>
              </div>
            </div>
            <span class="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              Skipped
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
