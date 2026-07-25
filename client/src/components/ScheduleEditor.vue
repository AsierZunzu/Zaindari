<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { schedulesApi } from '../api/schedules'
import type { MergedSchedule } from '../api/schedules'
import type { TaskType } from '../types'
import { taskTypeEmoji } from '../utils/date'
import { useTaskLabels } from '../composables/useTaskLabels'
import { useApiError } from '../composables/useApiError'

const props = defineProps<{
  plantId: string
}>()

const { taskType: taskTypeLabel } = useTaskLabels()
const { apiErrorMessage } = useApiError()

const schedules = ref<MergedSchedule[]>([])
const loading = ref(true)
const saving = ref<TaskType | null>(null)
const error = ref('')

/**
 * Whether this plant pins a reminder time for everyone who can see it. When it
 * does not, each collaborator is reminded at the time they chose in their own
 * settings, so there is no single value to show here.
 */
const usesOwnTime = ref<Record<string, boolean>>({})

const allTaskTypes: TaskType[] = ['watering', 'fertilization', 'misting', 'repotting']

onMounted(async () => {
  await fetchSchedules()
})

async function fetchSchedules() {
  loading.value = true
  error.value = ''
  try {
    schedules.value = await schedulesApi.getForPlant(props.plantId)
    usesOwnTime.value = Object.fromEntries(
      schedules.value.map((s) => [s.taskType, s.hour !== null]),
    )
  } catch (e: unknown) {
    error.value = apiErrorMessage(e, 'errors.schedules.loadFailed')
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
    const ownTime = usesOwnTime.value[schedule.taskType]
    await schedulesApi.setPlantSchedule(props.plantId, schedule.taskType, {
      intervalDays: schedule.intervalDays,
      hour: ownTime ? (schedule.hour ?? 9) : null,
      minute: ownTime ? (schedule.minute ?? 0) : null,
      enabled: schedule.enabled,
    })
    await fetchSchedules()
  } catch (e: unknown) {
    error.value = apiErrorMessage(e, 'errors.schedules.saveFailed')
  } finally {
    saving.value = null
  }
}

/**
 * Saves straight away rather than waiting for the row's save button: turning a
 * task type off also discards the tasks it had queued, so leaving the switch
 * flipped but unsaved would show a plant that looks off while still nagging.
 */
async function toggleEnabled(schedule: MergedSchedule, enabled: boolean) {
  if (saving.value) return
  saving.value = schedule.taskType
  error.value = ''
  try {
    const ownTime = usesOwnTime.value[schedule.taskType]
    await schedulesApi.setPlantSchedule(props.plantId, schedule.taskType, {
      intervalDays: schedule.intervalDays,
      hour: ownTime ? (schedule.hour ?? 9) : null,
      minute: ownTime ? (schedule.minute ?? 0) : null,
      enabled,
    })
    await fetchSchedules()
  } catch (e: unknown) {
    error.value = apiErrorMessage(e, 'errors.schedules.saveFailed')
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
    error.value = apiErrorMessage(e, 'errors.schedules.resetFailed')
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
            <span class="text-sm font-medium text-gray-900">{{ taskTypeLabel(taskType) }}</span>
          </div>

          <!-- On/off. Off means: create nothing new, drop what was queued. -->
          <label
            v-if="getSchedule(taskType)"
            class="flex items-center gap-1.5 text-xs text-gray-600"
          >
            <input
              type="checkbox"
              :checked="getSchedule(taskType)!.enabled"
              :disabled="saving === taskType"
              class="rounded border-gray-300 text-primary-600 focus:ring-primary-400 disabled:opacity-50"
              @change="(e: Event) => toggleEnabled(getSchedule(taskType)!, (e.target as HTMLInputElement).checked)"
            />
            {{ getSchedule(taskType)!.enabled ? $t('schedules.enabled') : $t('schedules.disabled') }}
          </label>

          <template v-if="getSchedule(taskType) && getSchedule(taskType)!.enabled">
            <!-- Interval -->
            <div class="flex items-center gap-1">
              <span class="text-xs text-gray-500">{{ $t('schedules.every') }}</span>
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
              <span class="text-xs text-gray-500">{{ $t('schedules.days') }}</span>
            </div>

            <!-- Reminder time: each collaborator's own, or pinned for all -->
            <div class="flex items-center gap-2">
              <span class="text-xs text-gray-500">{{ $t('schedules.at') }}</span>
              <label class="flex items-center gap-1 text-xs text-gray-600">
                <input
                  type="checkbox"
                  :checked="!usesOwnTime[taskType]"
                  class="rounded border-gray-300 text-primary-600 focus:ring-primary-400"
                  @change="(e: Event) => (usesOwnTime[taskType] = !(e.target as HTMLInputElement).checked)"
                />
                {{ $t('schedules.eachOwnTime') }}
              </label>
              <input
                v-if="usesOwnTime[taskType]"
                type="time"
                :value="formatTime(getSchedule(taskType)!.hour ?? 9, getSchedule(taskType)!.minute ?? 0)"
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
              {{ $t('schedules.custom') }}
            </span>

            <!-- Save button -->
            <button
              class="rounded-md bg-primary-50 px-2 py-1 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-100 disabled:opacity-50"
              :disabled="saving === taskType"
              @click="saveSchedule(getSchedule(taskType)!)"
            >
              {{ saving === taskType ? $t('common.saving') : $t('common.save') }}
            </button>

            <!-- Reset button -->
            <button
              v-if="getSchedule(taskType)!.isOverride"
              class="rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-50"
              :disabled="saving === taskType"
              @click="resetToDefault(taskType)"
            >
              {{ $t('schedules.reset') }}
            </button>
          </template>

          <span v-else-if="getSchedule(taskType)" class="text-xs text-gray-400 italic">
            {{ $t('schedules.disabledHint') }}
          </span>

          <span v-else class="text-xs text-gray-400 italic">{{ $t('schedules.none') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
