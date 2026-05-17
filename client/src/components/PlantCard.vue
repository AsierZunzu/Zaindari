<script setup lang="ts">
import type { PlantWithImage } from '../api/plants'
import type { Task } from '../types'
import { taskTypeEmoji, isOverdue, isDueToday } from '../utils/date'

defineProps<{
  plant: PlantWithImage
  pendingTasks?: Task[]
}>()
</script>

<template>
  <RouterLink
    :to="`/plants/${plant.id}`"
    class="block overflow-hidden rounded-xl bg-white shadow-md transition-shadow hover:shadow-lg"
  >
    <div class="aspect-[4/3] w-full overflow-hidden bg-primary-50">
      <img
        v-if="plant.currentImage"
        :src="`/api/images/${plant.currentImage.id}`"
        :alt="plant.name"
        class="h-full w-full object-cover"
      />
      <div v-else class="flex h-full w-full items-center justify-center">
        <span class="text-6xl">&#127793;</span>
      </div>
    </div>
    <div class="p-4">
      <h3 class="text-base font-bold text-gray-900">{{ plant.name }}</h3>
      <p v-if="plant.location" class="mt-1 text-sm text-gray-500">
        {{ plant.location }}
      </p>
      <!-- Pending task badges -->
      <div v-if="pendingTasks && pendingTasks.length > 0" class="mt-2 flex flex-wrap gap-1">
        <span
          v-for="task in pendingTasks"
          :key="task.id"
          class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
          :class="isOverdue(task.dueAt) ? 'bg-red-100 text-red-700' : isDueToday(task.dueAt) ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'"
        >
          {{ taskTypeEmoji(task.taskType) }}
        </span>
      </div>
    </div>
  </RouterLink>
</template>
