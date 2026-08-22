<script setup lang="ts">
import { useRoute } from 'vue-router'
import { computed } from 'vue'
import AppIcon from '../../components/AppIcon.vue'
import type { IconName } from '../../components/icons'

const route = useRoute()

const navItems: { key: string; path: string; icon: IconName }[] = [
  { key: 'admin.nav.users', path: '/admin/users', icon: 'user' },
  { key: 'admin.nav.config', path: '/admin/config', icon: 'settings' },
  { key: 'admin.nav.schedules', path: '/admin/schedules', icon: 'calendar' },
  { key: 'admin.nav.oidc', path: '/admin/oidc', icon: 'key' },
]

const currentPath = computed(() => route.path)
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <div class="mb-6">
      <h1 class="font-display text-3xl font-semibold text-ink">{{ $t('admin.title') }}</h1>
      <p class="text-sm text-ink-faint">{{ $t('admin.subtitle') }}</p>
    </div>

    <div class="flex flex-col gap-6 md:flex-row">
      <!-- Sidebar -->
      <nav class="w-full md:w-48 shrink-0">
        <div class="card p-2">
          <RouterLink
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            class="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-semibold transition-colors"
            :class="
              currentPath === item.path
                ? 'bg-primary-50 text-primary-800'
                : 'text-ink-muted hover:bg-surface-sunk hover:text-ink'
            "
          >
            <AppIcon :name="item.icon" :size="18" />
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
