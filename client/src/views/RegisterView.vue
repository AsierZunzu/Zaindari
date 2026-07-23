<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useI18n } from 'vue-i18n'
import { useApiError } from '../composables/useApiError'

const auth = useAuthStore()
const router = useRouter()
const { t } = useI18n()
const { apiErrorMessage } = useApiError()

const username = ref('')
const displayName = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const error = ref('')
const loading = ref(false)

async function handleSubmit() {
  error.value = ''

  if (!username.value || !displayName.value || !password.value) {
    error.value = t('auth.fillRequiredFields')
    return
  }
  if (username.value.length < 3) {
    error.value = t('auth.usernameTooShort')
    return
  }
  if (password.value.length < 8) {
    error.value = t('auth.passwordTooShort')
    return
  }
  if (password.value !== confirmPassword.value) {
    error.value = t('auth.passwordsDoNotMatch')
    return
  }

  loading.value = true
  try {
    await auth.register({
      username: username.value,
      displayName: displayName.value,
      email: email.value || undefined,
      password: password.value,
    })
    router.push('/')
  } catch (e: unknown) {
    error.value = apiErrorMessage(e, 'errors.auth.registrationFailed')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-[80vh] items-center justify-center">
    <div class="w-full max-w-sm">
      <div class="rounded-xl bg-white p-8 shadow-lg">
        <div class="mb-6 text-center">
          <span class="text-5xl">&#127807;</span>
          <h1 class="mt-2 text-2xl font-bold text-gray-900">{{ $t('auth.createAccount') }}</h1>
          <p class="text-sm text-gray-500">{{ $t('auth.createAccountSubtitle') }}</p>
        </div>

        <form @submit.prevent="handleSubmit" class="space-y-4">
          <div v-if="error" class="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {{ error }}
          </div>

          <div>
            <label for="username" class="block text-sm font-medium text-gray-700">{{ $t('auth.username') }} *</label>
            <input
              id="username"
              v-model="username"
              type="text"
              autocomplete="username"
              class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              :placeholder="$t('auth.usernameHint')"
            />
          </div>

          <div>
            <label for="displayName" class="block text-sm font-medium text-gray-700">{{ $t('auth.displayName') }} *</label>
            <input
              id="displayName"
              v-model="displayName"
              type="text"
              autocomplete="name"
              class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              :placeholder="$t('auth.displayNameHint')"
            />
          </div>

          <div>
            <label for="email" class="block text-sm font-medium text-gray-700">{{ $t('auth.email') }}</label>
            <input
              id="email"
              v-model="email"
              type="email"
              autocomplete="email"
              class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              :placeholder="$t('auth.emailHint')"
            />
          </div>

          <div>
            <label for="password" class="block text-sm font-medium text-gray-700">{{ $t('auth.password') }} *</label>
            <input
              id="password"
              v-model="password"
              type="password"
              autocomplete="new-password"
              class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              :placeholder="$t('auth.passwordHint')"
            />
          </div>

          <div>
            <label for="confirmPassword" class="block text-sm font-medium text-gray-700">{{ $t('auth.confirmPassword') }} *</label>
            <input
              id="confirmPassword"
              v-model="confirmPassword"
              type="password"
              autocomplete="new-password"
              class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              :placeholder="$t('auth.confirmPasswordHint')"
            />
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {{ loading ? $t('auth.creatingAccount') : $t('auth.createAccount') }}
          </button>
        </form>

        <p class="mt-6 text-center text-sm text-gray-500">
          {{ $t('auth.haveAccount') }}
          <RouterLink to="/login" class="font-medium text-primary-600 hover:text-primary-500">
            {{ $t('auth.signIn') }}
          </RouterLink>
        </p>
      </div>
    </div>
  </div>
</template>
