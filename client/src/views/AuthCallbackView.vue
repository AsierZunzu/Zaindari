<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import AppIcon from '../components/AppIcon.vue'
import { useI18n } from 'vue-i18n'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const { t } = useI18n()
const error = ref('')

onMounted(async () => {
  const token = route.query.token as string | undefined
  if (!token) {
    error.value = t('errors.auth.noToken')
    return
  }

  // Store the token
  localStorage.setItem('accessToken', token)
  auth.accessToken = token

  try {
    await auth.initialize()
    router.replace('/')
  } catch {
    error.value = t('errors.auth.sessionInitFailed')
    localStorage.removeItem('accessToken')
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
