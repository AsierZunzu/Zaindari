<script setup lang="ts">
import AppNavigation from './components/AppNavigation.vue'
import { useAuthStore } from './stores/auth'

const auth = useAuthStore()
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <AppNavigation v-if="auth.isAuthenticated" />
    <main class="mx-auto max-w-5xl px-4 py-6">
      <RouterView />
    </main>
  </div>
</template>
