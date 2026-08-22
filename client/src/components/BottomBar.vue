<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import AppIcon from './AppIcon.vue'

const auth = useAuthStore()
const router = useRouter()
const sheetOpen = ref(false)

async function logout() {
  sheetOpen.value = false
  await auth.logout()
  router.push('/login')
}
</script>

<template>
  <!--
    The mobile navigation. This replaces a hamburger sheet: the app is
    installed on phones and used one-handed while holding a watering can, so
    the two things anyone opens it for — what needs doing, and the plants
    themselves — belong under the thumb rather than behind a menu.
  -->
  <nav
    class="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface shadow-lift md:hidden"
    style="padding-bottom: env(safe-area-inset-bottom)"
  >
    <div class="mx-auto grid max-w-lg grid-cols-4 items-end px-2 pb-1 pt-1.5">
      <!--
        `exact-active-class`, not `active-class`: every route in the app is a
        child of `/`, so a prefix match would light this tab up on every screen.
      -->
      <RouterLink
        to="/"
        class="flex flex-col items-center gap-0.5 rounded-md py-1.5 text-ink-faint transition-colors"
        exact-active-class="!text-primary-700"
      >
        <AppIcon name="agenda" :size="22" />
        <span class="text-[0.6875rem] font-medium">{{ $t('nav.care') }}</span>
      </RouterLink>

      <RouterLink
        to="/garden"
        class="flex flex-col items-center gap-0.5 rounded-md py-1.5 text-ink-faint transition-colors"
        active-class="!text-primary-700"
      >
        <AppIcon name="leaf" :size="22" />
        <span class="text-[0.6875rem] font-medium">{{ $t('nav.garden') }}</span>
      </RouterLink>

      <!-- Adding a plant is the one creative act in the app, so it is a
           control rather than a tab. -->
      <RouterLink
        to="/plants/new"
        class="flex flex-col items-center gap-0.5 py-1.5"
        :aria-label="$t('nav.addPlant')"
      >
        <span
          class="flex size-9 items-center justify-center rounded-full bg-primary-700 text-surface transition-colors active:bg-primary-800"
        >
          <AppIcon name="plus" :size="20" />
        </span>
        <span class="text-[0.6875rem] font-medium text-ink-faint">{{ $t('nav.addPlant') }}</span>
      </RouterLink>

      <button
        class="flex flex-col items-center gap-0.5 rounded-md py-1.5 transition-colors"
        :class="sheetOpen ? 'text-primary-700' : 'text-ink-faint'"
        :aria-label="$t('nav.accountMenu')"
        :aria-expanded="sheetOpen"
        @click="sheetOpen = !sheetOpen"
      >
        <AppIcon name="user" :size="22" />
        <span class="text-[0.6875rem] font-medium">{{ $t('nav.account') }}</span>
      </button>
    </div>
  </nav>

  <!-- Settings, admin and logout are rare enough to live behind the account
       tab, and unrelated enough to each other to want separating rules. -->
  <Teleport to="body">
    <!-- The scrim is what dismisses the sheet. It is teleported after the bar
         and shares its stacking level, so it also covers the account tab —
         which is what makes a second tap on that tab close the sheet rather
         than re-toggling it. -->
    <div
      v-if="sheetOpen"
      class="fixed inset-0 z-40 bg-ink/20 md:hidden"
      aria-hidden="true"
      @click="sheetOpen = false"
    />
    <div
      v-if="sheetOpen"
      class="fixed inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-50 overflow-hidden rounded-lg border border-line bg-surface shadow-lift md:hidden"
    >
      <p class="border-b border-line px-4 py-3">
        <span class="block truncate text-sm font-semibold text-ink">
          {{ auth.user?.displayName }}
        </span>
        <span class="block truncate text-xs text-ink-faint">{{ auth.user?.username }}</span>
      </p>
      <RouterLink
        to="/settings"
        class="flex items-center gap-3 px-4 py-3 text-sm text-ink"
        @click="sheetOpen = false"
      >
        <AppIcon name="settings" :size="18" class="text-ink-faint" />
        {{ $t('nav.settings') }}
      </RouterLink>
      <RouterLink
        v-if="auth.isAdmin"
        to="/admin"
        class="flex items-center gap-3 border-t border-line px-4 py-3 text-sm text-ink"
        @click="sheetOpen = false"
      >
        <AppIcon name="shield" :size="18" class="text-ink-faint" />
        {{ $t('nav.adminPanel') }}
      </RouterLink>
      <button
        class="flex w-full items-center gap-3 border-t border-line px-4 py-3 text-left text-sm text-ink"
        @click="logout"
      >
        <AppIcon name="logout" :size="18" class="text-ink-faint" />
        {{ $t('nav.logout') }}
      </button>
    </div>
  </Teleport>
</template>
