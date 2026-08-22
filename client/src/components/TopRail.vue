<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import AppIcon from './AppIcon.vue'

const auth = useAuthStore()
const router = useRouter()
const menuOpen = ref(false)

async function logout() {
  menuOpen.value = false
  await auth.logout()
  router.push('/login')
}
</script>

<template>
  <!--
    The desktop half of the navigation; `BottomBar` is the mobile half, and the
    two are mutually exclusive at `md`. A single component cannot do both jobs
    any more: the bar sits at opposite ends of the screen, holds a different
    set of controls, and the phone version has no room for a wordmark.

    A hairline over the page's own paper, not a slab of saturated green. The
    chrome's job is to stay out of the way of the plant photographs, which are
    the only strongly coloured thing in the app.
  -->
  <header class="sticky top-0 z-40 hidden border-b border-line bg-ground md:block">
    <div class="mx-auto flex h-16 max-w-5xl items-center gap-8 px-4">
      <RouterLink to="/" class="flex items-center gap-2 text-ink">
        <AppIcon name="sprig" :size="24" class="text-primary-700" />
        <span class="font-display text-xl font-semibold tracking-tight">{{ $t('app.name') }}</span>
      </RouterLink>

      <nav class="flex items-center gap-6">
        <!--
          Active state is a rule under the label rather than a filled pill: at
          this size the underline is unambiguous and leaves the bar quiet.
          `-mb-px` pulls it onto the header's own border so the two meet.

          `exact-active-class` on the root link: every route is a child of `/`,
          so a prefix match marked this tab active on every screen — which is
          what the previous navigation did.
        -->
        <RouterLink
          to="/"
          class="-mb-px border-b-2 border-transparent py-5 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
          exact-active-class="!border-primary-700 !text-ink"
        >
          {{ $t('nav.care') }}
        </RouterLink>
        <RouterLink
          to="/garden"
          class="-mb-px border-b-2 border-transparent py-5 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
          active-class="!border-primary-700 !text-ink"
        >
          {{ $t('nav.garden') }}
        </RouterLink>
      </nav>

      <div class="ml-auto flex items-center gap-3">
        <RouterLink to="/plants/new" class="btn btn-primary">
          <AppIcon name="plus" :size="16" />
          {{ $t('nav.addPlant') }}
        </RouterLink>

        <div class="relative">
          <button
            class="flex size-9 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-800 transition-colors hover:bg-primary-200"
            :aria-label="$t('nav.accountMenu')"
            :aria-expanded="menuOpen"
            @click="menuOpen = !menuOpen"
          >
            {{ auth.user?.displayName?.charAt(0)?.toUpperCase() }}
          </button>

          <!-- An invisible catcher, so clicking anywhere else dismisses the
               menu; the old navigation left it open until a link was hit. -->
          <div v-if="menuOpen" class="fixed inset-0 z-40" @click="menuOpen = false" />

          <!-- A menu genuinely floats, so this is one of the few places that
               earns `shadow-lift`. -->
          <div
            v-if="menuOpen"
            class="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-lg border border-line bg-surface shadow-lift"
          >
            <p class="border-b border-line px-4 py-3">
              <span class="block truncate text-sm font-semibold text-ink">
                {{ auth.user?.displayName }}
              </span>
              <span class="block truncate text-xs text-ink-faint">{{ auth.user?.username }}</span>
            </p>
            <RouterLink
              to="/settings"
              class="flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink transition-colors hover:bg-surface-sunk"
              @click="menuOpen = false"
            >
              <AppIcon name="settings" :size="16" class="text-ink-faint" />
              {{ $t('nav.settings') }}
            </RouterLink>
            <RouterLink
              v-if="auth.isAdmin"
              to="/admin"
              class="flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink transition-colors hover:bg-surface-sunk"
              @click="menuOpen = false"
            >
              <AppIcon name="shield" :size="16" class="text-ink-faint" />
              {{ $t('nav.adminPanel') }}
            </RouterLink>
            <button
              class="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-ink transition-colors hover:bg-surface-sunk"
              @click="logout"
            >
              <AppIcon name="logout" :size="16" class="text-ink-faint" />
              {{ $t('nav.logout') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>
