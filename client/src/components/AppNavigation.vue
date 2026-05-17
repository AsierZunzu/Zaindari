<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()
const mobileMenuOpen = ref(false)
const userMenuOpen = ref(false)

function logout() {
  auth.logout()
  router.push('/login')
}

function toggleMobileMenu() {
  mobileMenuOpen.value = !mobileMenuOpen.value
  userMenuOpen.value = false
}

function toggleUserMenu() {
  userMenuOpen.value = !userMenuOpen.value
}

function closeMenus() {
  mobileMenuOpen.value = false
  userMenuOpen.value = false
}
</script>

<template>
  <nav class="bg-primary-700 shadow-lg">
    <div class="mx-auto max-w-5xl px-4">
      <div class="flex h-14 items-center justify-between">
        <!-- Brand -->
        <RouterLink to="/" class="flex items-center gap-2 text-xl font-bold text-white" @click="closeMenus">
          <span class="text-2xl">&#127807;</span>
          <span>Zaindari</span>
        </RouterLink>

        <!-- Desktop nav -->
        <div class="hidden items-center gap-4 md:flex">
          <RouterLink
            to="/"
            class="rounded-md px-3 py-2 text-sm font-medium text-primary-100 transition-colors hover:bg-primary-600 hover:text-white"
            active-class="bg-primary-800 !text-white"
          >
            Dashboard
          </RouterLink>
          <RouterLink
            to="/plants/new"
            class="rounded-md bg-primary-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-400"
          >
            + Add Plant
          </RouterLink>

          <!-- User dropdown -->
          <div class="relative">
            <button
              class="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-primary-100 transition-colors hover:bg-primary-600"
              @click="toggleUserMenu"
            >
              <span class="flex h-7 w-7 items-center justify-center rounded-full bg-primary-500 text-xs font-bold text-white">
                {{ auth.user?.displayName?.charAt(0)?.toUpperCase() }}
              </span>
              <span>{{ auth.user?.displayName }}</span>
            </button>

            <div
              v-if="userMenuOpen"
              class="absolute right-0 z-50 mt-1 w-48 rounded-md bg-white py-1 shadow-lg ring-1 ring-black/5"
            >
              <RouterLink
                to="/settings"
                class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                @click="closeMenus"
              >
                Settings
              </RouterLink>
              <RouterLink
                v-if="auth.isAdmin"
                to="/admin"
                class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                @click="closeMenus"
              >
                Admin Panel
              </RouterLink>
              <button
                class="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                @click="logout"
              >
                Logout
              </button>
            </div>
          </div>
        </div>

        <!-- Mobile hamburger -->
        <button
          class="rounded-md p-2 text-primary-100 hover:bg-primary-600 md:hidden"
          @click="toggleMobileMenu"
        >
          <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              v-if="!mobileMenuOpen"
              stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 6h16M4 12h16M4 18h16"
            />
            <path
              v-else
              stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>

    <!-- Mobile menu -->
    <div v-if="mobileMenuOpen" class="border-t border-primary-600 md:hidden">
      <div class="space-y-1 px-4 py-3">
        <RouterLink
          to="/"
          class="block rounded-md px-3 py-2 text-base font-medium text-primary-100 hover:bg-primary-600 hover:text-white"
          @click="closeMenus"
        >
          Dashboard
        </RouterLink>
        <RouterLink
          to="/plants/new"
          class="block rounded-md px-3 py-2 text-base font-medium text-primary-100 hover:bg-primary-600 hover:text-white"
          @click="closeMenus"
        >
          + Add Plant
        </RouterLink>
        <RouterLink
          to="/settings"
          class="block rounded-md px-3 py-2 text-base font-medium text-primary-100 hover:bg-primary-600 hover:text-white"
          @click="closeMenus"
        >
          Settings
        </RouterLink>
        <RouterLink
          v-if="auth.isAdmin"
          to="/admin"
          class="block rounded-md px-3 py-2 text-base font-medium text-primary-100 hover:bg-primary-600 hover:text-white"
          @click="closeMenus"
        >
          Admin Panel
        </RouterLink>
        <button
          class="block w-full rounded-md px-3 py-2 text-left text-base font-medium text-primary-100 hover:bg-primary-600 hover:text-white"
          @click="logout"
        >
          Logout
        </button>
      </div>
    </div>
  </nav>
</template>
