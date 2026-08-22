<script setup lang="ts">
import { ICON_PATHS, type IconName } from './icons'

withDefaults(
  defineProps<{
    name: IconName
    /** Edge length in px. The grid is 24, so anything from 14 to 32 holds up. */
    size?: number | string
    strokeWidth?: number | string
  }>(),
  { size: 20, strokeWidth: 1.5 },
)
</script>

<template>
  <!--
    Always `aria-hidden`: an icon here is either decorative or sits inside a
    control that already carries its own `aria-label`/`title`. Labelling it
    again would make a screen reader announce the button twice.
  -->
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path v-for="(d, i) in ICON_PATHS[name]" :key="i" :d="d" />
  </svg>
</template>
