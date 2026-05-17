<script setup lang="ts">
import type { PlantWithImage } from '../api/plants'

defineProps<{
  plant: PlantWithImage
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
    </div>
  </RouterLink>
</template>
