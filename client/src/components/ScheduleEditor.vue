<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { schedulesApi } from '../api/schedules'
import type { MergedSchedule } from '../api/schedules'
import type { TaskType } from '../types'
import { formatTaskType, taskTypeEmoji } from '../utils/date'

const props = defineProps<{
  plantId: string
}>()

const schedules = ref<MergedSchedule[]>([])
const loading = ref(true)
const saving = ref<TaskType | null>(null)
const error = ref('')

const allTaskTypes: TaskType[] = ['watering', 'fertilization', 'misting', 'repotting']

onMounted(async () => {
  await fetchSchedules()
})

async function fetchSchedules() {
  loading.value = true
  error.value = ''
  try {
    schedules.value = await schedulesApi.getForPlant(props.plantId)
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to load schedules'
  } finally {
    loading.value = false
  }
}

function getSchedule(taskType: TaskType): MergedSchedule | undefined {
  return schedules.value.find((s) => s.taskType === taskType)
}

async function saveSchedule(schedule: MergedSchedule) {
  if (saving.value) return
  saving.value = schedule.taskType
  error.value = ''
  try {
    await schedulesApi.setPlantSchedule(props.plantId, schedule.taskType, {
      intervalDays: schedule.intervalDays,
      hour: schedule.hour,
      minute: schedule.minute,
    })
    await fetchSchedules()
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to save schedule'
  } finally {
    saving.value = null
  }
}

async function resetToDefault(taskType: TaskType) {
  if (saving.value) return
  saving.value = taskType
  error.value = ''
  try {
    await schedulesApi.removePlantSchedule(props.plantId, taskType)
    await fetchSchedules()
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to reset schedule'
  } finally {
    saving.value = null
  }
}

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function parseTime(timeStr: string): { hour: number; minute: number } {
  const [h, m] = timeStr.split(':').map(Number)
  return { hour: h, minute: m }
}
</script>

<template>
  <div>
    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-4">
      <div class="h-6 w-6 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
    </div>

    <!-- Error -->
    <div v-if="error" class="mb-3 rounded-md bg-red-50 p-3 text-xs text-red-700">
      {{ error }}
    </div>

    <!-- Schedule rows -->
    <div v-if="!loading" class="space-y-3">
      <div
        v-for="taskType in allTaskTypes"
        :key="taskType"
        class="rounded-lg bg-white p-3 shadow-sm ring-1 ring-gray-100"
      >
        <div class="flex flex-wrap items-center gap-3">
          <!-- Icon + Label -->
          <div class="flex items-center gap-2">
            <span class="text-lg">{{ taskTypeEmoji(taskType) }}</span>
            <span class="text-sm font-medium text-gray-900">{{ formatTaskType(taskType) }}</span>
          </div>

          <template v-if="getSchedule(taskType)">
            <!-- Interval -->
            <div class="flex items-center gap-1">
              <span class="text-xs text-gray-500">Every</span>
              <input
                type="number"
                :value="getSchedule(taskType)!.intervalDays"
                min="1"
                max="365"
                class="w-16 rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400"
                @change="(e: Event) => {
                  const sched = getSchedule(taskType)!
                  sched.intervalDays = parseInt((e.target as HTMLInputElement).value) || sched.intervalDays
                }"
              />
              <span class="text-xs text-gray-500">days</span>
            </div>

            <!-- Time -->
            <div class="flex items-center gap-1">
              <span class="text-xs text-gray-500">at</span>
              <input
                type="time"
                :value="formatTime(getSchedule(taskType)!.hour, getSchedule(taskType)!.minute)"
                class="rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400"
                @change="(e: Event) => {
                  const sched = getSchedule(taskType)!
                  const parsed = parseTime((e.target as HTMLInputElement).value)
                  sched.hour = parsed.hour
                  sched.minute = parsed.minute
                }"
              />
            </div>

            <!-- Override indicator -->
            <span
              v-if="getSchedule(taskType)!.isOverride"
              class="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700"
            >
              Custom
            </span>

            <!-- Save button -->
            <button
              class="rounded-md bg-primary-50 px-2 py-1 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-100 disabled:opacity-50"
              :disabled="saving === taskType"
              @click="saveSchedule(getSchedule(taskType)!)"
            >
              {{ saving === taskType ? 'Saving...' : 'Save' }}
            </button>

            <!-- Reset button -->
            <button
              v-if="getSchedule(taskType)!.isOverride"
              class="rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-50"
              :disabled="saving === taskType"
              @click="resetToDefault(taskType)"
            >
              Reset
            </button>
          </template>

          <span v-else class="text-xs text-gray-400 italic">No schedule configured</span>
        </div>
      </div>
    </div>
  </div>
</template>
