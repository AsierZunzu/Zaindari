<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()

const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function handleSubmit() {
  error.value = ''
  if (!username.value || !password.value) {
    error.value = 'Please fill in all fields'
    return
  }

  loading.value = true
  try {
    await auth.login(username.value, password.value)
    router.push('/')
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Login failed'
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
          <h1 class="mt-2 text-2xl font-bold text-gray-900">Zaindari</h1>
          <p class="text-sm text-gray-500">Sign in to your account</p>
        </div>

        <form @submit.prevent="handleSubmit" class="space-y-4">
          <div v-if="error" class="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {{ error }}
          </div>

          <div>
            <label for="username" class="block text-sm font-medium text-gray-700">Username</label>
            <input
              id="username"
              v-model="username"
              type="text"
              autocomplete="username"
              class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="Enter your username"
            />
          </div>

          <div>
            <label for="password" class="block text-sm font-medium text-gray-700">Password</label>
            <input
              id="password"
              v-model="password"
              type="password"
              autocomplete="current-password"
              class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="Enter your password"
            />
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {{ loading ? 'Signing in...' : 'Sign In' }}
          </button>
        </form>

        <p class="mt-6 text-center text-sm text-gray-500">
          Don't have an account?
          <RouterLink to="/register" class="font-medium text-primary-600 hover:text-primary-500">
            Sign up
          </RouterLink>
        </p>
      </div>
    </div>
  </div>
</template>
