<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import type { IconName } from './icons'

/**
 * The one empty state. It replaced four hand-built ones — three dashed-border
 * boxes and the garden's `border-2 border-dashed border-gray-300` panel — which
 * had drifted into three different paddings and two different type sizes.
 */
withDefaults(
  defineProps<{
    title: string
    description?: string
    icon?: IconName
    /** `sm` for a slot inside a page, `lg` for a whole empty screen. */
    size?: 'sm' | 'lg'
  }>(),
  { icon: 'sprig', size: 'sm' },
)
</script>

<template>
  <div
    class="card-inset flex flex-col items-center text-center"
    :class="size === 'lg' ? 'gap-2 px-6 py-12' : 'gap-1.5 px-4 py-8'"
  >
    <AppIcon :name="icon" :size="size === 'lg' ? 40 : 28" class="text-primary-500" />
    <p class="font-display text-ink" :class="size === 'lg' ? 'text-lg font-semibold' : 'text-sm'">
      {{ title }}
    </p>
    <p v-if="description" class="max-w-sm text-sm text-ink-faint">{{ description }}</p>
    <!-- Whatever the user should do about it, when there is something to do. -->
    <div v-if="$slots.default" :class="size === 'lg' ? 'mt-4' : 'mt-2'">
      <slot />
    </div>
  </div>
</template>
