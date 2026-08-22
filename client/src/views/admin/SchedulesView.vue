<script setup lang="ts">
import LoadingPlaceholder from '../../components/LoadingPlaceholder.vue'
import { ref, onMounted } from 'vue'
import { adminApi } from '../../api/admin'
import type { DefaultSchedule } from '../../api/admin'
import type { TaskType } from '../../types'
import { useI18n } from 'vue-i18n'
import { taskTypeIcon } from '../../utils/date'
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
</script>

<template>
  <div>
    <div class="mb-4">
      <h2 class="font-display text-xl font-semibold text-ink">{{ $t('admin.schedules.title') }}</h2>
      <p class="text-xs text-ink-faint">{{ $t('admin.schedules.subtitle') }}</p>
    </div>

    <!-- Messages -->
    <div v-if="error" class="mb-4 rounded-md bg-overdue-soft px-3 py-2.5 text-sm text-overdue-ink">{{ error }}</div>
    <div v-if="success" class="mb-4 rounded-md bg-done-soft px-3 py-2.5 text-sm text-done-ink">{{ success }}</div>

    <!-- Loading -->
    <LoadingPlaceholder v-if="loading" :count="3" />

    <!-- Schedule rows -->
    <div v-if="!loading" class="space-y-3">
      <div
        v-for="schedule in schedules"
        :key="schedule.id"
        class="card p-4"
      >
        <div class="flex flex-wrap items-center gap-4">
          <!-- Icon + Label -->
          <div class="flex items-center gap-2 w-32">
            <AppIcon :name="taskTypeIcon(schedule.taskType as TaskType)" :size="18" class="text-ink-muted" />
            <span class="text-sm font-semibold text-ink">{{ taskTypeLabel(schedule.taskType as TaskType) }}</span>
          </div>

          <!-- Interval -->
          <div class="flex items-center gap-1">
            <span class="text-xs text-ink-faint">{{ $t('schedules.every') }}</span>
            <input
              type="number"
              v-model.number="schedule.intervalDays"
              min="1"
              max="365"
              class="field-input w-16 px-2 py-1 tabular-nums"
            />
            <span class="text-xs text-ink-faint">{{ $t('schedules.days') }}</span>
          </div>

          <!-- Save button -->
          <button
            @click="saveSchedule(schedule)"
            :disabled="saving === schedule.taskType"
            class="rounded-sm border border-line bg-surface px-3 py-1 text-xs font-semibold text-primary-700 transition-colors hover:bg-primary-50 disabled:opacity-50"
          >
            {{ saving === schedule.taskType ? $t('common.saving') : $t('common.save') }}
          </button>
        </div>
      </div>

      <div v-if="schedules.length === 0" class="card p-8 text-center text-sm text-ink-faint">
        {{ $t('admin.schedules.empty') }}
      </div>
    </div>
  </div>
</template>
