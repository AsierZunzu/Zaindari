<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { dashboardApi } from '../api/dashboard'
import type { DashboardPlant } from '../types'
import PlantCard from '../components/PlantCard.vue'

const auth = useAuthStore()
const plants = ref<DashboardPlant[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    plants.value = await dashboardApi.get()
  } catch {
    // fallback: empty list
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold text-gray-900">{{ $t('plants.inventory') }}</h1>
    <p class="mt-1 text-sm text-gray-500">
      {{ $t('plants.inventorySubtitle', { name: auth.user?.displayName }) }}
    </p>

    <!-- Loading spinner -->
    <div v-if="loading" class="mt-12 flex justify-center">
      <div class="h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
    </div>

    <!-- Plants grid -->
    <div
      v-else-if="plants.length > 0"
      class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <PlantCard
        v-for="dp in plants"
        :key="dp.plant.id"
        :plant="{ ...dp.plant, currentImage: dp.currentImage }"
        :pending-tasks="dp.pendingTasks"
      />
    </div>

    <!-- Empty state -->
    <div
      v-else
      class="mt-8 flex flex-col items-center rounded-xl border-2 border-dashed border-gray-300 bg-white p-12 text-center"
    >
      <span class="text-6xl">&#127793;</span>
      <h2 class="mt-4 text-lg font-semibold text-gray-900">{{ $t('plants.noneYet') }}</h2>
      <p class="mt-1 text-sm text-gray-500">{{ $t('plants.getStarted') }}</p>
      <RouterLink
        to="/plants/new"
        class="mt-6 inline-flex items-center rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-500"
      >
        {{ $t('plants.addFirst') }}
      </RouterLink>
    </div>
  </div>
</template>
