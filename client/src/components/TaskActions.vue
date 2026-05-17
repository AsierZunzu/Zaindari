<script setup lang="ts">
import { ref } from 'vue'
import { tasksApi } from '../api/tasks'
import type { Task } from '../types'

const props = defineProps<{
  task: Task
  plantId: string
}>()

const emit = defineEmits<{
  'task-updated': [task: Task]
}>()

const showSnooze = ref(false)
const showSkip = ref(false)
const skipReason = ref('')
const acting = ref(false)

const snoozeOptions = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '12h', hours: 12 },
  { label: '1d', hours: 24 },
  { label: '3d', hours: 72 },
]

async function completeTask() {
  if (acting.value) return
  acting.value = true
  try {
    const updated = await tasksApi.completeByType(props.plantId, props.task.taskType)
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

async function snoozeTask(hours: number) {
  if (acting.value) return
  acting.value = true
  try {
    const updated = await tasksApi.snooze(props.task.id, hours)
    showSnooze.value = false
    emit('task-updated', updated)
  } catch {
    // error handling could be enhanced
  } finally {
    acting.value = false
  }
}

async function skipTask() {
  if (acting.value) return
  if (!skipReason.value.trim()) return
  acting.value = true
  try {
    const updated = await tasksApi.skip(props.task.id, skipReason.value.trim())
    showSkip.value = false
    skipReason.value = ''
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
      title="Complete"
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
      title="Snooze"
      @click="showSnooze = !showSnooze; showSkip = false"
    >
      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </button>

    <!-- Skip button (for pending) -->
    <button
      v-if="task.status === 'pending'"
      class="inline-flex items-center justify-center rounded-md bg-gray-50 p-1.5 text-gray-500 transition-colors hover:bg-gray-100"
      title="Skip"
      @click="showSkip = !showSkip; showSnooze = false"
    >
      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
      </svg>
    </button>

    <!-- Undo button (for done) -->
    <button
      v-if="task.status === 'done'"
      class="inline-flex items-center justify-center rounded-md bg-blue-50 p-1.5 text-blue-600 transition-colors hover:bg-blue-100 disabled:opacity-50"
      title="Undo"
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
        :key="opt.hours"
        class="rounded-md border border-yellow-200 bg-yellow-50 px-2 py-1 text-xs font-medium text-yellow-700 transition-colors hover:bg-yellow-100 disabled:opacity-50"
        :disabled="acting"
        @click="snoozeTask(opt.hours)"
      >
        {{ opt.label }}
      </button>
    </div>

    <!-- Skip reason input -->
    <div v-if="showSkip" class="flex w-full items-center gap-2 pt-1">
      <input
        v-model="skipReason"
        type="text"
        placeholder="Reason for skipping..."
        class="flex-1 rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400"
        @keyup.enter="skipTask"
      />
      <button
        class="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50"
        :disabled="acting || !skipReason.trim()"
        @click="skipTask"
      >
        Confirm
      </button>
    </div>
  </div>
</template>
