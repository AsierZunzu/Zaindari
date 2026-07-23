<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { adminApi } from '../../api/admin'
import type { DefaultSchedule } from '../../api/admin'
import type { TaskType } from '../../types'
import { useI18n } from 'vue-i18n'
import { taskTypeEmoji } from '../../utils/date'
import { useTaskLabels } from '../../composables/useTaskLabels'
import { useApiError } from '../../composables/useApiError'

const { t } = useI18n()
const { taskType: taskTypeLabel } = useTaskLabels()
const { apiErrorMessage } = useApiError()

const schedules = ref<DefaultSchedule[]>([])
const loading = ref(true)
const saving = ref<string | null>(null)
const error = ref('')
const success = ref('')

onMounted(() => fetchSchedules())

async function fetchSchedules() {
  loading.value = true
  error.value = ''
  try {
    schedules.value = await adminApi.getSchedules()
  } catch (e: unknown) {
    error.value = apiErrorMessage(e, 'errors.schedules.loadFailed')
  } finally {
    loading.value = false
  }
}

async function saveSchedule(schedule: DefaultSchedule) {
  if (saving.value) return
  saving.value = schedule.taskType
  error.value = ''
  success.value = ''
  try {
    await adminApi.updateSchedule(schedule.taskType, {
      intervalDays: schedule.intervalDays,
      hour: schedule.hour,
      minute: schedule.minute,
    })
    success.value = t('admin.schedules.updated', {
      type: taskTypeLabel(schedule.taskType as TaskType),
    })
    setTimeout(() => (success.value = ''), 3000)
  } catch (e: unknown) {
    error.value = apiErrorMessage(e, 'errors.schedules.saveFailed')
  } finally {
    saving.value = null
  }
}

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function parseTime(timeStr: string, schedule: DefaultSchedule) {
  const [h, m] = timeStr.split(':').map(Number)
  schedule.hour = h
  schedule.minute = m
}
</script>

<template>
  <div>
    <div class="mb-4">
      <h2 class="text-lg font-semibold text-gray-900">{{ $t('admin.schedules.title') }}</h2>
      <p class="text-xs text-gray-500">{{ $t('admin.schedules.subtitle') }}</p>
    </div>

    <!-- Messages -->
    <div v-if="error" class="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700">{{ success }}</div>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-8">
      <div class="h-6 w-6 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
    </div>

    <!-- Schedule rows -->
    <div v-if="!loading" class="space-y-3">
      <div
        v-for="schedule in schedules"
        :key="schedule.id"
        class="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100"
      >
        <div class="flex flex-wrap items-center gap-4">
          <!-- Icon + Label -->
          <div class="flex items-center gap-2 w-32">
            <span class="text-lg">{{ taskTypeEmoji(schedule.taskType as TaskType) }}</span>
            <span class="text-sm font-medium text-gray-900">{{ taskTypeLabel(schedule.taskType as TaskType) }}</span>
          </div>

          <!-- Interval -->
          <div class="flex items-center gap-1">
            <span class="text-xs text-gray-500">{{ $t('schedules.every') }}</span>
            <input
              type="number"
              v-model.number="schedule.intervalDays"
              min="1"
              max="365"
              class="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400"
            />
            <span class="text-xs text-gray-500">{{ $t('schedules.days') }}</span>
          </div>

          <!-- Time -->
          <div class="flex items-center gap-1">
            <span class="text-xs text-gray-500">{{ $t('schedules.at') }}</span>
            <input
              type="time"
              :value="formatTime(schedule.hour, schedule.minute)"
              @change="(e: Event) => parseTime((e.target as HTMLInputElement).value, schedule)"
              class="rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400"
            />
          </div>

          <!-- Save button -->
          <button
            @click="saveSchedule(schedule)"
            :disabled="saving === schedule.taskType"
            class="rounded-md bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-100 disabled:opacity-50"
          >
            {{ saving === schedule.taskType ? $t('common.saving') : $t('common.save') }}
          </button>
        </div>
      </div>

      <div v-if="schedules.length === 0" class="rounded-xl bg-white p-8 text-center text-sm text-gray-400 shadow-sm ring-1 ring-gray-100">
        {{ $t('admin.schedules.empty') }}
      </div>
    </div>
  </div>
</template>
