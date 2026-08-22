<script setup lang="ts">
import type { PlantWithImage } from '../api/plants'
import type { Task } from '../types'
import { taskTypeIcon } from '../utils/date'
import { statusTone, TONE_BADGE } from '../utils/tone'
import { useTaskLabels } from '../composables/useTaskLabels'
import AppIcon from './AppIcon.vue'
import AuthedImage from './AuthedImage.vue'

defineProps<{
  plant: PlantWithImage
  pendingTasks?: Task[]
}>()

const { taskType } = useTaskLabels()
</script>

<template>
  <RouterLink
    :to="`/plants/${plant.id}`"
    class="card group block overflow-hidden transition-colors hover:border-line-strong"
  >
    <div class="aspect-[4/3] w-full overflow-hidden bg-surface-sunk">
      <AuthedImage
        v-if="plant.currentImage"
        :src="`/api/images/${plant.currentImage.id}`"
        :alt="plant.name"
        class="h-full w-full object-cover"
      />
      <div v-else class="flex h-full w-full items-center justify-center text-primary-500">
        <AppIcon name="sprig" :size="56" :stroke-width="1.25" />
      </div>
    </div>
    <div class="flex flex-col gap-1 border-t border-line p-4">
      <h3 class="truncate font-display text-lg font-semibold leading-tight text-ink">
        {{ plant.name }}
      </h3>
      <p v-if="plant.location" class="flex items-center gap-1 truncate text-sm text-ink-faint">
        <AppIcon name="pin" :size="14" class="shrink-0" />{{ plant.location }}
      </p>
      <!--
        What this plant is waiting for. The icon says which job and the tone
        says how late it is, so a shelf of cards can be read for trouble
        without opening any of them — the `title` carries the same thing for a
        pointer, since the badge itself is deliberately wordless here.
      -->
      <div v-if="pendingTasks && pendingTasks.length > 0" class="mt-1 flex flex-wrap gap-1">
        <span
          v-for="task in pendingTasks"
          :key="task.id"
          class="badge"
          :class="TONE_BADGE[statusTone(task)]"
          :title="taskType(task.taskType)"
        >
          <AppIcon :name="taskTypeIcon(task.taskType)" :size="14" />
        </span>
      </div>
    </div>
  </RouterLink>
</template>
