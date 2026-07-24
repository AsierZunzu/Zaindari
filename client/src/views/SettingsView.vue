<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNotifications } from '../composables/useNotifications'
import { useApiError } from '../composables/useApiError'
import { useAuthStore } from '../stores/auth'
import { SUPPORTED_LOCALES, type Locale } from '../i18n'
import { refreshDocumentTitle } from '../router'
import { schedulesApi, type UserNotificationTimes } from '../api/schedules'
import DataTransfer from '../components/DataTransfer.vue'
import type { TaskType } from '../types'
import { taskTypeEmoji } from '../utils/date'
import { useTaskLabels } from '../composables/useTaskLabels'

const { isSupported, permission, isSubscribed, subscribe, unsubscribe } =
  useNotifications()
const { locale } = useI18n()
const { apiErrorMessage } = useApiError()
const auth = useAuthStore()

const subscribing = ref(false)
const errorMessage = ref('')
const localeError = ref('')

const selectedLocale = computed({
  get: () => locale.value as Locale,
  set: (value: Locale) => {
    void changeLanguage(value)
  },
})

async function changeLanguage(value: Locale) {
  localeError.value = ''
  try {
    await auth.changeLocale(value)
    // Titles are only written on navigation, so an open tab would otherwise
    // keep the previous language's title until the user navigates.
    refreshDocumentTitle()
  } catch (err) {
    localeError.value = apiErrorMessage(err)
  }
}

// ── Notification times ───────────────────────────────────────────────

const { taskType: taskTypeLabel } = useTaskLabels()

const allTaskTypes: TaskType[] = [
  'watering',
  'fertilization',
  'misting',
  'repotting',
]

const times = ref<UserNotificationTimes | null>(null)
const timesError = ref('')
const savingTime = ref<string | null>(null)

onMounted(() => void loadTimes())

async function loadTimes() {
  timesError.value = ''
  try {
    times.value = await schedulesApi.getMyNotificationTimes()
  } catch (err) {
    timesError.value = apiErrorMessage(err, 'errors.schedules.loadFailed')
  }
}

async function saveBaseTime(value: string) {
  const parsed = parseTime(value)
  if (!parsed) return

  savingTime.value = 'base'
  timesError.value = ''
  try {
    times.value = await schedulesApi.setMyBaseTime(parsed)
  } catch (err) {
    timesError.value = apiErrorMessage(err, 'errors.schedules.saveFailed')
  } finally {
    savingTime.value = null
  }
}

async function saveTaskTime(
  taskType: TaskType,
  time: { hour: number; minute: number } | null,
) {
  savingTime.value = taskType
  timesError.value = ''
  try {
    times.value = await schedulesApi.setMyTaskTime(taskType, {
      hour: time?.hour ?? null,
      minute: time?.minute ?? null,
    })
  } catch (err) {
    timesError.value = apiErrorMessage(err, 'errors.schedules.saveFailed')
  } finally {
    savingTime.value = null
  }
}

/**
 * Switching a task type to its own time seeds the input from the base time, so
 * the value on screen is the one that was already in effect.
 */
function toggleTaskOverride(taskType: TaskType, useOwn: boolean) {
  if (!times.value) return
  void saveTaskTime(taskType, useOwn ? { ...times.value.base } : null)
}

function formatTime(time: { hour: number; minute: number }): string {
  return `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`
}

function parseTime(value: string): { hour: number; minute: number } | null {
  const [hour, minute] = value.split(':').map(Number)
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null
  return { hour, minute }
}

async function toggleNotifications() {
  if (subscribing.value) return

  subscribing.value = true
  errorMessage.value = ''
  try {
    if (isSubscribed.value) {
      await unsubscribe()
    } else {
      await subscribe()
    }
  } catch (err) {
    errorMessage.value = apiErrorMessage(err)
  } finally {
    subscribing.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-lg px-4 py-6">
    <h1 class="mb-6 text-2xl font-bold text-gray-900">{{ $t('settings.title') }}</h1>

    <section class="mb-4 rounded-lg border border-gray-200 bg-white p-5">
      <h2 class="mb-4 text-lg font-semibold text-gray-800">
        {{ $t('settings.language') }}
      </h2>

      <label for="locale" class="sr-only">{{ $t('settings.language') }}</label>
      <select
        id="locale"
        v-model="selectedLocale"
        class="block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
      >
        <!-- Endonyms: a language is listed in its own language, so someone
             stranded in a language they cannot read can still find theirs. -->
        <option v-for="code in SUPPORTED_LOCALES" :key="code" :value="code">
          {{ $t(`languages.${code}`) }}
        </option>
      </select>

      <p class="mt-2 text-xs text-gray-500">{{ $t('settings.languageHint') }}</p>

      <div
        v-if="localeError"
        class="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700"
      >
        {{ localeError }}
      </div>
    </section>

    <section class="rounded-lg border border-gray-200 bg-white p-5">
      <h2 class="mb-4 text-lg font-semibold text-gray-800">
        {{ $t('settings.pushNotifications') }}
      </h2>

      <div v-if="!isSupported" class="text-sm text-gray-500">
        {{ $t('settings.pushNotSupported') }}
      </div>

      <div v-else>
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-700">
              {{ $t('settings.enableNotifications') }}
            </p>
            <p class="mt-0.5 text-xs text-gray-500">
              {{ $t('settings.enableNotificationsHint') }}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            :aria-checked="isSubscribed"
            :aria-label="$t('settings.enableNotifications')"
            :disabled="subscribing"
            class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            :class="isSubscribed ? 'bg-green-600' : 'bg-gray-200'"
            @click="toggleNotifications"
          >
            <span
              class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
              :class="isSubscribed ? 'translate-x-5' : 'translate-x-0'"
            />
          </button>
        </div>

        <div
          v-if="errorMessage"
          class="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700"
        >
          {{ errorMessage }}
        </div>

        <div
          v-else-if="permission === 'denied'"
          class="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700"
        >
          {{ $t('settings.notificationsBlocked') }}
        </div>

        <div
          v-else-if="isSubscribed"
          class="mt-3 rounded-md bg-green-50 p-3 text-sm text-green-700"
        >
          {{ $t('settings.notificationsEnabled') }}
        </div>
      </div>
    </section>

    <section class="mt-4 rounded-lg border border-gray-200 bg-white p-5">
      <h2 class="mb-1 text-lg font-semibold text-gray-800">
        {{ $t('settings.notificationTime') }}
      </h2>
      <p class="mb-4 text-xs text-gray-500">
        {{ $t('settings.notificationTimeHint') }}
      </p>

      <div
        v-if="timesError"
        class="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700"
      >
        {{ timesError }}
      </div>

      <div v-if="times">
        <!-- Base time -->
        <div class="flex items-center justify-between gap-3">
          <label for="base-time" class="text-sm font-medium text-gray-700">
            {{ $t('settings.notificationTimeBase') }}
          </label>
          <input
            id="base-time"
            type="time"
            :value="formatTime(times.base)"
            :disabled="savingTime === 'base'"
            class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-50"
            @change="(e: Event) => saveBaseTime((e.target as HTMLInputElement).value)"
          />
        </div>

        <!-- Per task type -->
        <div class="mt-4 space-y-3 border-t border-gray-100 pt-4">
          <div
            v-for="taskType in allTaskTypes"
            :key="taskType"
            class="flex flex-wrap items-center gap-3"
          >
            <div class="flex w-32 items-center gap-2">
              <span class="text-base">{{ taskTypeEmoji(taskType) }}</span>
              <span class="text-sm text-gray-700">{{ taskTypeLabel(taskType) }}</span>
            </div>

            <label class="flex items-center gap-1.5 text-xs text-gray-600">
              <input
                type="checkbox"
                :checked="!times.overrides[taskType]"
                :disabled="savingTime === taskType"
                class="rounded border-gray-300 text-primary-600 focus:ring-primary-400"
                @change="(e: Event) => toggleTaskOverride(taskType, !(e.target as HTMLInputElement).checked)"
              />
              {{ $t('settings.notificationTimeUseBase') }}
            </label>

            <span v-if="!times.overrides[taskType]" class="text-xs text-gray-400">
              {{ formatTime(times.base) }}
            </span>
            <input
              v-else
              type="time"
              :value="formatTime(times.overrides[taskType]!)"
              :disabled="savingTime === taskType"
              class="rounded-lg border border-gray-300 px-2 py-1 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-50"
              @change="(e: Event) => {
                const parsed = parseTime((e.target as HTMLInputElement).value)
                if (parsed) saveTaskTime(taskType, parsed)
              }"
            />
          </div>
        </div>

        <p class="mt-4 text-xs text-gray-400">
          {{ $t('settings.notificationTimePlantNote') }}
        </p>
      </div>
    </section>

    <DataTransfer />
  </div>
</template>
