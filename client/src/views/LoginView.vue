<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import AppIcon from '../components/AppIcon.vue'
import { SESSION_EXPIRED_PARAM } from '../api/client'
import { authApi } from '../api/auth'
import { useI18n } from 'vue-i18n'
import { useApiError } from '../composables/useApiError'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const { t, te } = useI18n()
const { apiErrorMessage } = useApiError()

/**
 * The OIDC callback is a page load, so when it fails the server can only
 * redirect here with an error code in the query; it is worded like any other.
 */
function ssoErrorFromQuery(): string {
  const code = route.query.sso
  if (typeof code !== 'string') return ''
  const key = `errors.${code}`
  return te(key) ? t(key) : t('errors.auth.oidcFailed')
}

const username = ref('')
const password = ref('')
const error = ref(ssoErrorFromQuery())
const loading = ref(false)
const oidcLoading = ref(false)
const oidcAvailable = ref(false)
const oidcName = ref<string | null>(null)
// Set when the api client sent us here because the server rejected the session,
// as opposed to someone opening the login page themselves.
const sessionExpired = SESSION_EXPIRED_PARAM in route.query

onMounted(async () => {
  try {
    const status = await authApi.oidcStatus()
    oidcAvailable.value = status.enabled
    oidcName.value = status.name
  } catch {
    // Offline, or a server that predates the endpoint: just no SSO button.
  }
})

async function handleSubmit() {
  error.value = ''
  if (!username.value || !password.value) {
    error.value = t('auth.fillAllFields')
    return
  }

  loading.value = true
  try {
    await auth.login(username.value, password.value)
    router.push('/')
  } catch (e: unknown) {
    error.value = apiErrorMessage(e, 'errors.auth.loginFailed')
  } finally {
    loading.value = false
  }
}

async function loginWithOidc() {
  oidcLoading.value = true
  error.value = ''
  try {
    const data = await authApi.oidcStart()
    window.location.href = data.url
  } catch (e: unknown) {
    error.value = apiErrorMessage(e, 'errors.auth.oidcLoginFailed')
    oidcLoading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-[80vh] items-center justify-center">
    <div class="w-full max-w-sm">
      <div class="card p-8">
        <div class="mb-6 text-center">
          <AppIcon name="sprig" :size="44" class="mx-auto text-primary-700" />
          <h1 class="mt-2 font-display text-3xl font-semibold tracking-tight text-ink">{{ $t('app.name') }}</h1>
          <p class="text-sm text-ink-faint">{{ $t('auth.signInSubtitle') }}</p>
        </div>

        <form @submit.prevent="handleSubmit" class="space-y-4">
          <div
            v-if="sessionExpired && !error"
            role="status"
            class="rounded-md bg-due-soft px-3 py-2.5 text-sm text-due-ink"
          >
            {{ $t('errors.auth.sessionExpired') }}
          </div>

          <div v-if="error" class="rounded-md bg-overdue-soft px-3 py-2.5 text-sm text-overdue-ink">
            {{ error }}
          </div>

          <div>
            <label for="username" class="field-label">{{ $t('auth.username') }}</label>
            <input
              id="username"
              v-model="username"
              type="text"
              autocomplete="username"
              class="field-input mt-1"
              :placeholder="$t('auth.usernamePlaceholder')"
            />
          </div>

          <div>
            <label for="password" class="field-label">{{ $t('auth.password') }}</label>
            <input
              id="password"
              v-model="password"
              type="password"
              autocomplete="current-password"
              class="field-input mt-1"
              :placeholder="$t('auth.passwordPlaceholder')"
            />
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="btn btn-primary w-full"
          >
            {{ loading ? $t('auth.signingIn') : $t('auth.signIn') }}
          </button>
        </form>

        <!-- OIDC Login -->
        <div v-if="oidcAvailable" class="mt-4">
          <div class="relative my-4">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-line" />
            </div>
            <div class="relative flex justify-center text-xs">
              <span class="bg-surface px-2 text-ink-faint">{{ $t('auth.or') }}</span>
            </div>
          </div>
          <button
            @click="loginWithOidc"
            :disabled="oidcLoading"
            class="btn btn-quiet w-full"
          >
            {{
              oidcLoading
                ? $t('auth.redirecting')
                : oidcName
                  ? $t('auth.signInWithProvider', { name: oidcName })
                  : $t('auth.signInWithSso')
            }}
          </button>
        </div>

        <p class="mt-6 text-center text-sm text-ink-faint">
          {{ $t('auth.noAccount') }}
          <RouterLink to="/register" class="font-semibold text-primary-700 hover:underline">
            {{ $t('auth.signUp') }}
          </RouterLink>
        </p>
      </div>
    </div>
  </div>
</template>
