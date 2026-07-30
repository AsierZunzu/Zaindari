<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
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

/**
 * One row of the editor. Everything the user touches lives here and nothing
 * reaches the server until the section's save button is pressed, so editing one
 * task type can never discard a half-finished edit on another.
 *
 * `usesOwnTime` is the inverse of "this plant pins a reminder time for everyone
 * who can see it": when the plant pins nothing, each collaborator is reminded at
 * the time they chose in their own settings, so there is no single value to show.
 *
 * `pendingReset` is a queued delete of the per-plant override. It cannot be
 * applied locally — the values it would fall back to are the merged defaults,
 * which only the server knows — so the row is frozen until save resolves it.
 */
interface Draft {
  taskType: TaskType
  intervalDays: number
  hour: number
  minute: number
  usesOwnTime: boolean
  enabled: boolean
  isOverride: boolean
  pendingReset: boolean
}

const drafts = ref<Draft[]>([])
/** Last known server state, per task type, to diff drafts against. */
const baseline = ref<Record<string, Draft>>({})
const loading = ref(true)
const saving = ref(false)
const error = ref('')

const allTaskTypes: TaskType[] = ['watering', 'fertilization', 'misting', 'repotting']

onMounted(async () => {
  await fetchSchedules()
})

function toDraft(schedule: MergedSchedule): Draft {
  return {
    taskType: schedule.taskType,
    intervalDays: schedule.intervalDays,
    hour: schedule.hour ?? 9,
    minute: schedule.minute ?? 0,
    usesOwnTime: schedule.hour !== null,
    enabled: schedule.enabled,
    isOverride: schedule.isOverride,
    pendingReset: false,
  }
}

async function fetchSchedules() {
  loading.value = true
  error.value = ''
  try {
    const schedules = await schedulesApi.getForPlant(props.plantId)
    drafts.value = schedules.map(toDraft)
    baseline.value = Object.fromEntries(drafts.value.map((d) => [d.taskType, { ...d }]))
  } catch (e: unknown) {
    error.value = apiErrorMessage(e, 'errors.schedules.loadFailed')
  } finally {
    loading.value = false
  }
}

function getDraft(taskType: TaskType): Draft | undefined {
  return drafts.value.find((d) => d.taskType === taskType)
}

function isDirty(draft: Draft): boolean {
  const base = baseline.value[draft.taskType]
  if (!base) return true
  if (draft.pendingReset) return true
  if (draft.enabled !== base.enabled) return true
  // An off task type creates nothing, so its interval and time are inert.
  if (!draft.enabled) return false
  return (
    draft.intervalDays !== base.intervalDays ||
    draft.usesOwnTime !== base.usesOwnTime ||
    (draft.usesOwnTime && (draft.hour !== base.hour || draft.minute !== base.minute))
  )
}

const dirtyDrafts = computed(() => drafts.value.filter(isDirty))
const hasChanges = computed(() => dirtyDrafts.value.length > 0)

/**
 * Saves every changed row. Rows go one at a time and each success is folded into
 * the baseline immediately, so a failure halfway through leaves the rows that did
 * land marked clean and the rest still editable — retrying sends only what is
 * genuinely outstanding rather than replaying writes the server already took.
 */
async function saveAll() {
  if (saving.value || !hasChanges.value) return
  saving.value = true
  error.value = ''
  try {
    for (const draft of dirtyDrafts.value) {
      if (draft.pendingReset) {
        await schedulesApi.removePlantSchedule(props.plantId, draft.taskType)
      } else {
        await schedulesApi.setPlantSchedule(props.plantId, draft.taskType, {
          intervalDays: draft.intervalDays,
          hour: draft.usesOwnTime ? draft.hour : null,
          minute: draft.usesOwnTime ? draft.minute : null,
          enabled: draft.enabled,
        })
      }
      baseline.value[draft.taskType] = { ...draft, pendingReset: false }
    }
    // Only now re-read: a reset row and `isOverride` are the server's answer.
    await fetchSchedules()
  } catch (e: unknown) {
    error.value = apiErrorMessage(e, 'errors.schedules.saveFailed')
  } finally {
    saving.value = false
  }
}

function discardChanges() {
  if (saving.value) return
  error.value = ''
  drafts.value = drafts.value.map((d) => ({ ...(baseline.value[d.taskType] ?? d) }))
}

function markReset(draft: Draft) {
  draft.pendingReset = true
}

function undoReset(draft: Draft) {
  const base = baseline.value[draft.taskType]
  Object.assign(draft, base ? { ...base } : { pendingReset: false })
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

          <template v-if="getDraft(taskType)">
            <!-- A queued reset freezes the row: its values are the server's to decide -->
            <template v-if="getDraft(taskType)!.pendingReset">
              <span class="text-xs text-gray-500 italic">{{ $t('schedules.resetPending') }}</span>
              <button
                class="rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-50"
                :disabled="saving"
                @click="undoReset(getDraft(taskType)!)"
              >
                {{ $t('schedules.undoReset') }}
              </button>
            </template>

            <template v-else>
              <!-- On/off. Off means: create nothing new, drop what was queued. -->
              <label class="flex items-center gap-1.5 text-xs text-gray-600">
                <input
                  type="checkbox"
                  :checked="getDraft(taskType)!.enabled"
                  :disabled="saving"
                  class="rounded border-gray-300 text-primary-600 focus:ring-primary-400 disabled:opacity-50"
                  @change="(e: Event) => (getDraft(taskType)!.enabled = (e.target as HTMLInputElement).checked)"
                />
                {{ getDraft(taskType)!.enabled ? $t('schedules.enabled') : $t('schedules.disabled') }}
              </label>

              <template v-if="getDraft(taskType)!.enabled">
                <!-- Interval -->
                <div class="flex items-center gap-1">
                  <span class="text-xs text-gray-500">{{ $t('schedules.every') }}</span>
                  <input
                    type="number"
                    :value="getDraft(taskType)!.intervalDays"
                    min="1"
                    max="365"
                    :disabled="saving"
                    class="w-16 rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400 disabled:opacity-50"
                    @change="(e: Event) => {
                      const draft = getDraft(taskType)!
                      draft.intervalDays = parseInt((e.target as HTMLInputElement).value) || draft.intervalDays
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
                      :checked="!getDraft(taskType)!.usesOwnTime"
                      :disabled="saving"
                      class="rounded border-gray-300 text-primary-600 focus:ring-primary-400 disabled:opacity-50"
                      @change="(e: Event) => (getDraft(taskType)!.usesOwnTime = !(e.target as HTMLInputElement).checked)"
                    />
                    {{ $t('schedules.eachOwnTime') }}
                  </label>
                  <input
                    v-if="getDraft(taskType)!.usesOwnTime"
                    type="time"
                    :value="formatTime(getDraft(taskType)!.hour, getDraft(taskType)!.minute)"
                    :disabled="saving"
                    class="rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400 disabled:opacity-50"
                    @change="(e: Event) => {
                      const draft = getDraft(taskType)!
                      const parsed = parseTime((e.target as HTMLInputElement).value)
                      draft.hour = parsed.hour
                      draft.minute = parsed.minute
                    }"
                  />
                </div>

                <!-- Override indicator -->
                <span
                  v-if="getDraft(taskType)!.isOverride"
                  class="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700"
                >
                  {{ $t('schedules.custom') }}
                </span>

                <!-- Reset: queued like every other edit, applied on save -->
                <button
                  v-if="getDraft(taskType)!.isOverride"
                  class="rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-50"
                  :disabled="saving"
                  @click="markReset(getDraft(taskType)!)"
                >
                  {{ $t('schedules.reset') }}
                </button>
              </template>

              <span v-else class="text-xs text-gray-400 italic">
                {{ $t('schedules.disabledHint') }}
              </span>
            </template>
          </template>

          <span v-else class="text-xs text-gray-400 italic">{{ $t('schedules.none') }}</span>
        </div>
      </div>

      <!-- One save for the whole section -->
      <div class="flex items-center justify-end gap-2 pt-1">
        <span v-if="hasChanges" class="mr-auto text-xs text-gray-500 italic">
          {{ $t('schedules.unsavedChanges') }}
        </span>
        <button
          v-if="hasChanges"
          class="rounded-md bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-50"
          :disabled="saving"
          @click="discardChanges"
        >
          {{ $t('common.cancel') }}
        </button>
        <button
          class="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
          :disabled="saving || !hasChanges"
          @click="saveAll"
        >
          {{ saving ? $t('common.saving') : $t('common.saveChanges') }}
        </button>
      </div>
    </div>
  </div>
</template>
