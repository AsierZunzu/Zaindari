<script setup lang="ts" generic="T extends string">
/**
 * The agenda/calendar switch and the plant page's Tasks/Schedule/Photos tabs
 * are the same control, so they are the same component. Generic over the value
 * type, so each caller keeps its own union rather than passing strings around.
 */
defineProps<{
  modelValue: T
  options: { value: T; label: string }[]
}>()

defineEmits<{
  'update:modelValue': [value: T]
}>()
</script>

<template>
  <!-- A sunk well with the active segment raised out of it in paper: the same
       figure/ground move the cards use, rather than a coloured pill. -->
  <div class="inline-flex rounded-md bg-surface-sunk p-0.5" role="group">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="rounded-sm px-3 py-1.5 text-sm font-semibold transition-colors"
      :class="
        modelValue === option.value
          ? 'bg-surface text-ink shadow-xs'
          : 'text-ink-faint hover:text-ink'
      "
      :aria-pressed="modelValue === option.value"
      @click="$emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
