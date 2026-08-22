<script setup lang="ts">
/**
 * One block of settings. Five of these were being written out by hand, which
 * is how the page ended up with `mb-4` on four sections and `mt-4` on the
 * fifth, and headings that were all the same size as each other and as the
 * labels underneath them.
 */
defineProps<{
  title: string
  hint?: string
}>()
</script>

<template>
  <section class="card flex flex-col gap-4 p-5">
    <div class="flex flex-col gap-1">
      <h2 class="font-display text-lg font-semibold leading-tight text-ink">{{ title }}</h2>
      <p v-if="hint" class="text-sm text-ink-faint">{{ hint }}</p>
    </div>
    <slot />
  </section>
</template>
