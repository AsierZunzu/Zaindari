<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
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
      <div v-if="error" class="rounded-xl bg-white p-8 shadow-lg">
        <div class="mb-4 text-4xl">&#9888;&#65039;</div>
        <p class="text-red-600">{{ error }}</p>
        <RouterLink
          to="/login"
          class="mt-4 inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-500"
        >
          {{ $t('auth.backToLogin') }}
        </RouterLink>
      </div>
      <div v-else>
        <div class="h-8 w-8 mx-auto animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
        <p class="mt-4 text-sm text-gray-500">{{ $t('auth.completingSignIn') }}</p>
      </div>
    </div>
  </div>
</template>
