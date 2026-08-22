<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import AppIcon from '../components/AppIcon.vue'
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
      <div class="card p-8">
        <div class="mb-6 text-center">
          <AppIcon name="sprig" :size="44" class="mx-auto text-primary-700" />
          <h1 class="mt-2 font-display text-3xl font-semibold tracking-tight text-ink">{{ $t('auth.createAccount') }}</h1>
          <p class="text-sm text-ink-faint">{{ $t('auth.createAccountSubtitle') }}</p>
        </div>

        <form @submit.prevent="handleSubmit" class="space-y-4">
          <div v-if="error" class="rounded-md bg-overdue-soft px-3 py-2.5 text-sm text-overdue-ink">
            {{ error }}
          </div>

          <div>
            <label for="username" class="field-label">{{ $t('auth.username') }} *</label>
            <input
              id="username"
              v-model="username"
              type="text"
              autocomplete="username"
              class="field-input mt-1"
              :placeholder="$t('auth.usernameHint')"
            />
          </div>

          <div>
            <label for="displayName" class="field-label">{{ $t('auth.displayName') }} *</label>
            <input
              id="displayName"
              v-model="displayName"
              type="text"
              autocomplete="name"
              class="field-input mt-1"
              :placeholder="$t('auth.displayNameHint')"
            />
          </div>

          <div>
            <label for="email" class="field-label">{{ $t('auth.email') }}</label>
            <input
              id="email"
              v-model="email"
              type="email"
              autocomplete="email"
              class="field-input mt-1"
              :placeholder="$t('auth.emailHint')"
            />
          </div>

          <div>
            <label for="password" class="field-label">{{ $t('auth.password') }} *</label>
            <input
              id="password"
              v-model="password"
              type="password"
              autocomplete="new-password"
              class="field-input mt-1"
              :placeholder="$t('auth.passwordHint')"
            />
          </div>

          <div>
            <label for="confirmPassword" class="field-label">{{ $t('auth.confirmPassword') }} *</label>
            <input
              id="confirmPassword"
              v-model="confirmPassword"
              type="password"
              autocomplete="new-password"
              class="field-input mt-1"
              :placeholder="$t('auth.confirmPasswordHint')"
            />
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="btn btn-primary w-full"
          >
            {{ loading ? $t('auth.creatingAccount') : $t('auth.createAccount') }}
          </button>
        </form>

        <p class="mt-6 text-center text-sm text-ink-faint">
          {{ $t('auth.haveAccount') }}
          <RouterLink to="/login" class="font-semibold text-primary-700 hover:underline">
            {{ $t('auth.signIn') }}
          </RouterLink>
        </p>
      </div>
    </div>
  </div>
</template>
