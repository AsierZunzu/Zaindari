<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNotifications } from '../composables/useNotifications'
import { useInstallPrompt } from '../composables/useInstallPrompt'
import { useApiError } from '../composables/useApiError'
import { useAuthStore } from '../stores/auth'
import { SUPPORTED_LOCALES, type Locale } from '../i18n'
import { refreshDocumentTitle } from '../router'
import { schedulesApi, type UserNotificationTimes } from '../api/schedules'
import AppIcon from '../components/AppIcon.vue'
import SettingsSection from '../components/SettingsSection.vue'
import DataTransfer from '../components/DataTransfer.vue'
import type { TaskType } from '../types'
import { taskTypeIcon } from '../utils/date'
import { useTaskLabels } from '../composables/useTaskLabels'

const { isSupported, permission, isSubscribed, subscribe, unsubscribe } =
  useNotifications()
const { canInstall, isInstalled, promptInstall } = useInstallPrompt()
const { locale } = useI18n()
const { apiErrorMessage } = useApiError()
const auth = useAuthStore()

const subscribing = ref(false)
const errorMessage = ref('')
const localeError = ref('')
const installing = ref(false)

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

async function installApp() {
  installing.value = true
  try {
    // We deliberately say nothing about the result: 'accepted' flips the whole
    // section to its installed state on its own, and a dismissal is the user's
    // call to make quietly — the button simply stays where it was.
    await promptInstall()
  } finally {
    installing.value = false
  }
}
</script>

<template>
  <!-- `main` already supplies the page gutter; this only narrows the column.
       Settings is a read-and-adjust page, so it stays a single column: five
       sections do not earn a navigation of their own. -->
  <div class="mx-auto flex max-w-2xl flex-col gap-4">
    <h1 class="font-display text-3xl font-semibold text-ink">{{ $t('settings.title') }}</h1>

    <SettingsSection :title="$t('settings.install.title')">
      <p v-if="isInstalled" class="badge bg-done-soft text-done-ink">
        {{ $t('settings.install.installed') }}
      </p>

      <template v-else>
        <div class="flex items-center justify-between gap-4">
          <p class="text-sm text-ink-faint">{{ $t('settings.install.hint') }}</p>
          <button
            v-if="canInstall"
            type="button"
            :disabled="installing"
            class="btn btn-primary shrink-0"
            @click="installApp"
          >
            {{ $t('settings.install.action') }}
          </button>
        </div>

        <!-- Firefox and Safari never fire beforeinstallprompt, and Brave can
             go quiet too, so the button simply will not appear for some
             people. Say where to look rather than showing nothing. -->
        <p v-if="!canInstall" class="card-inset p-3 text-sm text-ink-muted">
          {{ $t('settings.install.unavailable') }}
        </p>
      </template>
    </SettingsSection>

    <SettingsSection :title="$t('settings.language')" :hint="$t('settings.languageHint')">
      <label for="locale" class="sr-only">{{ $t('settings.language') }}</label>
      <select id="locale" v-model="selectedLocale" class="field-input">
        <!-- Endonyms: a language is listed in its own language, so someone
             stranded in a language they cannot read can still find theirs. -->
        <option v-for="code in SUPPORTED_LOCALES" :key="code" :value="code">
          {{ $t(`languages.${code}`) }}
        </option>
      </select>

      <p
        v-if="localeError"
        class="flex items-center gap-2 rounded-md bg-overdue-soft px-3 py-2.5 text-sm text-overdue-ink"
      >
        <AppIcon name="alert" :size="16" class="shrink-0" />
        {{ localeError }}
      </p>
    </SettingsSection>

    <SettingsSection :title="$t('settings.pushNotifications')">
      <p v-if="!isSupported" class="text-sm text-ink-faint">
        {{ $t('settings.pushNotSupported') }}
      </p>

      <template v-else>
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="text-sm font-semibold text-ink">
              {{ $t('settings.enableNotifications') }}
            </p>
            <p class="mt-0.5 text-sm text-ink-faint">
              {{ $t('settings.enableNotificationsHint') }}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            :aria-checked="isSubscribed"
            :aria-label="$t('settings.enableNotifications')"
            :disabled="subscribing"
            class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out disabled:cursor-not-allowed disabled:opacity-50"
            :class="isSubscribed ? 'bg-primary-700' : 'bg-line-strong'"
            @click="toggleNotifications"
          >
            <span
              class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-surface shadow-sm ring-0 transition duration-200 ease-in-out"
              :class="isSubscribed ? 'translate-x-5' : 'translate-x-0'"
            />
          </button>
        </div>

        <p
          v-if="errorMessage"
          class="flex items-center gap-2 rounded-md bg-overdue-soft px-3 py-2.5 text-sm text-overdue-ink"
        >
          <AppIcon name="alert" :size="16" class="shrink-0" />
          {{ errorMessage }}
        </p>

        <p
          v-else-if="permission === 'denied'"
          class="flex items-center gap-2 rounded-md bg-overdue-soft px-3 py-2.5 text-sm text-overdue-ink"
        >
          <AppIcon name="alert" :size="16" class="shrink-0" />
          {{ $t('settings.notificationsBlocked') }}
        </p>

        <p
          v-else-if="isSubscribed"
          class="flex items-center gap-2 rounded-md bg-done-soft px-3 py-2.5 text-sm text-done-ink"
        >
          <AppIcon name="check" :size="16" class="shrink-0" />
          {{ $t('settings.notificationsEnabled') }}
        </p>
      </template>
    </SettingsSection>

    <SettingsSection
      :title="$t('settings.notificationTime')"
      :hint="$t('settings.notificationTimeHint')"
    >
      <p
        v-if="timesError"
        class="flex items-center gap-2 rounded-md bg-overdue-soft px-3 py-2.5 text-sm text-overdue-ink"
      >
        <AppIcon name="alert" :size="16" class="shrink-0" />
        {{ timesError }}
      </p>

      <div v-if="times" class="flex flex-col gap-4">
        <div class="flex items-center justify-between gap-3">
          <label for="base-time" class="text-sm font-semibold text-ink">
            {{ $t('settings.notificationTimeBase') }}
          </label>
          <input
            id="base-time"
            type="time"
            :value="formatTime(times.base)"
            :disabled="savingTime === 'base'"
            class="field-input w-auto tabular-nums disabled:opacity-50"
            @change="(e: Event) => saveBaseTime((e.target as HTMLInputElement).value)"
          />
        </div>

        <!-- Per task type. Each row is one plain sentence: this job, at the
             base time or at its own. -->
        <div class="flex flex-col gap-3 border-t border-line pt-4">
          <div
            v-for="taskType in allTaskTypes"
            :key="taskType"
            class="flex flex-wrap items-center gap-3"
          >
            <div class="flex w-32 items-center gap-2 text-ink">
              <AppIcon :name="taskTypeIcon(taskType)" :size="18" class="text-ink-muted" />
              <span class="truncate text-sm">{{ taskTypeLabel(taskType) }}</span>
            </div>

            <label class="flex items-center gap-1.5 text-sm text-ink-muted">
              <input
                type="checkbox"
                :checked="!times.overrides[taskType]"
                :disabled="savingTime === taskType"
                class="rounded-sm border-line-strong text-primary-700 focus:ring-primary-400"
                @change="(e: Event) => toggleTaskOverride(taskType, !(e.target as HTMLInputElement).checked)"
              />
              {{ $t('settings.notificationTimeUseBase') }}
            </label>

            <span v-if="!times.overrides[taskType]" class="text-sm tabular-nums text-ink-faint">
              {{ formatTime(times.base) }}
            </span>
            <input
              v-else
              type="time"
              :value="formatTime(times.overrides[taskType]!)"
              :disabled="savingTime === taskType"
              class="field-input w-auto tabular-nums disabled:opacity-50"
              @change="(e: Event) => {
                const parsed = parseTime((e.target as HTMLInputElement).value)
                if (parsed) saveTaskTime(taskType, parsed)
              }"
            />
          </div>
        </div>

        <p class="text-sm text-ink-faint">{{ $t('settings.notificationTimePlantNote') }}</p>
      </div>
    </SettingsSection>

    <DataTransfer />
  </div>
</template>
