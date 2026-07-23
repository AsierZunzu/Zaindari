<script setup lang="ts">
import { useRoute } from 'vue-router'
import { computed } from 'vue'

const route = useRoute()

const navItems = [
  { key: 'admin.nav.users', path: '/admin/users', icon: '\u{1F465}' },
  { key: 'admin.nav.config', path: '/admin/config', icon: '\u{2699}\uFE0F' },
  { key: 'admin.nav.schedules', path: '/admin/schedules', icon: '\u{1F4C5}' },
  { key: 'admin.nav.oidc', path: '/admin/oidc', icon: '\u{1F511}' },
]

const currentPath = computed(() => route.path)
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 py-6">
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900">{{ $t('admin.title') }}</h1>
      <p class="text-sm text-gray-500">{{ $t('admin.subtitle') }}</p>
    </div>

    <div class="flex flex-col gap-6 md:flex-row">
      <!-- Sidebar -->
      <nav class="w-full md:w-48 shrink-0">
        <div class="rounded-xl bg-white p-2 shadow-sm ring-1 ring-gray-100">
          <RouterLink
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            :class="
              currentPath === item.path
                ? 'bg-primary-50 text-primary-700'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            "
          >
            <span>{{ item.icon }}</span>
            <span>{{ $t(item.key) }}</span>
          </RouterLink>
        </div>
      </nav>

      <!-- Content -->
      <div class="flex-1 min-w-0">
        <RouterView />
      </div>
    </div>
  </div>
</template>
