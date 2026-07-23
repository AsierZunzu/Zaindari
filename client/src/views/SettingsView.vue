<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNotifications } from '../composables/useNotifications'
import { useApiError } from '../composables/useApiError'
import { useAuthStore } from '../stores/auth'
import { SUPPORTED_LOCALES, type Locale } from '../i18n'
import { refreshDocumentTitle } from '../router'

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
  </div>
</template>
