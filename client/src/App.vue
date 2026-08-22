<script setup lang="ts">
import BottomBar from './components/BottomBar.vue'
import TopRail from './components/TopRail.vue'
import { useAuthStore } from './stores/auth'

const auth = useAuthStore()
</script>

<template>
  <div class="min-h-screen">
    <TopRail v-if="auth.isAuthenticated" />
    <!-- The bottom padding clears the mobile bar, which is fixed and would
         otherwise sit on top of the last row of whatever is being read. -->
    <main class="mx-auto max-w-5xl px-4 pb-28 pt-6 md:pb-10">
      <RouterView />
    </main>
    <BottomBar v-if="auth.isAuthenticated" />
  </div>
</template>
