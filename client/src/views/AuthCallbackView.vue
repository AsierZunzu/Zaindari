<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import AppIcon from '../components/AppIcon.vue'
import { useApiError } from '../composables/useApiError'

const router = useRouter()
const auth = useAuthStore()
const { apiErrorMessage } = useApiError()
const error = ref('')

// The server lands here only after a successful sign-on, having set the
// refresh cookie; failures go back to /login with a code instead.
onMounted(async () => {
  try {
    await auth.completeSso()
    router.replace('/')
  } catch (e: unknown) {
    error.value = apiErrorMessage(e, 'errors.auth.sessionInitFailed')
  }
})
</script>

<template>
  <div class="flex min-h-[80vh] items-center justify-center">
    <div class="text-center">
      <div v-if="error" class="card flex flex-col items-center gap-3 p-8">
        <AppIcon name="alert" :size="36" class="text-overdue" />
        <p class="text-sm text-overdue-ink">{{ error }}</p>
        <RouterLink
          to="/login"
          class="btn btn-primary mt-4"
        >
          {{ $t('auth.backToLogin') }}
        </RouterLink>
      </div>
      <div v-else>
        <div class="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-700" />
        <p class="mt-4 text-sm text-ink-faint">{{ $t('auth.completingSignIn') }}</p>
      </div>
    </div>
  </div>
</template>
