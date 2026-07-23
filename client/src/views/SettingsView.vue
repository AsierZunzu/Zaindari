<script setup lang="ts">
import { ref } from 'vue'
import { useNotifications } from '../composables/useNotifications'

const { isSupported, permission, isSubscribed, subscribe, unsubscribe } =
  useNotifications()

const subscribing = ref(false)
const errorMessage = ref('')

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
    errorMessage.value =
      err instanceof Error
        ? err.message
        : 'Something went wrong. Please try again.'
  } finally {
    subscribing.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-lg px-4 py-6">
    <h1 class="mb-6 text-2xl font-bold text-gray-900">Settings</h1>

    <section class="rounded-lg border border-gray-200 bg-white p-5">
      <h2 class="mb-4 text-lg font-semibold text-gray-800">
        Push Notifications
      </h2>

      <div v-if="!isSupported" class="text-sm text-gray-500">
        Push notifications are not supported in this browser.
      </div>

      <div v-else>
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-700">
              Enable notifications
            </p>
            <p class="mt-0.5 text-xs text-gray-500">
              Get notified when your plants need care
            </p>
          </div>
          <button
            type="button"
            role="switch"
            :aria-checked="isSubscribed"
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
          Notifications are blocked. Please allow notifications for this site in
          your browser settings.
        </div>

        <div
          v-else-if="isSubscribed"
          class="mt-3 rounded-md bg-green-50 p-3 text-sm text-green-700"
        >
          Notifications are enabled. You will receive reminders when your plants
          need care.
        </div>
      </div>
    </section>
  </div>
</template>
