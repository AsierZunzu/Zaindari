<script setup lang="ts">
/**
 * What the app shows while a feed is in flight, in place of the spinning ring
 * that was copy-pasted into three views.
 *
 * A skeleton in the shape of the thing being fetched: the page does not jump
 * when the data lands, and there is no spinner asking someone to watch it. The
 * pulse is Tailwind's `animate-pulse`, which the base layer already neutralises
 * under `prefers-reduced-motion`.
 */
withDefaults(
  defineProps<{
    /** `rows` for the agenda and task lists, `cards` for the garden grid. */
    variant?: 'rows' | 'cards'
    count?: number
  }>(),
  { variant: 'rows', count: 3 },
)
</script>

<template>
  <div
    :class="
      variant === 'cards'
        ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'
        : 'flex flex-col gap-2'
    "
    role="status"
    aria-busy="true"
  >
    <template v-if="variant === 'cards'">
      <div v-for="i in count" :key="i" class="card animate-pulse overflow-hidden">
        <div class="aspect-[4/3] w-full bg-surface-sunk" />
        <div class="flex flex-col gap-2 p-4">
          <div class="h-4 w-2/3 rounded-sm bg-surface-sunk" />
          <div class="h-3 w-1/3 rounded-sm bg-surface-sunk" />
        </div>
      </div>
    </template>
    <template v-else>
      <div v-for="i in count" :key="i" class="card flex animate-pulse items-center gap-3 p-3">
        <div class="size-11 shrink-0 rounded-md bg-surface-sunk" />
        <div class="flex min-w-0 flex-1 flex-col gap-2">
          <div class="h-3.5 w-1/3 rounded-sm bg-surface-sunk" />
          <div class="h-3 w-1/2 rounded-sm bg-surface-sunk" />
        </div>
      </div>
    </template>
  </div>
</template>
