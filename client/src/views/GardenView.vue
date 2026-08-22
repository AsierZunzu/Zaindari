<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { dashboardApi } from '../api/dashboard'
import type { DashboardPlant } from '../types'
import PlantCard from '../components/PlantCard.vue'
import EmptyState from '../components/EmptyState.vue'
import LoadingPlaceholder from '../components/LoadingPlaceholder.vue'

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
    <h1 class="font-display text-3xl font-semibold text-ink">{{ $t('plants.garden') }}</h1>
    <p class="mt-1 text-sm text-ink-muted">
      {{ $t('plants.gardenSubtitle', { name: auth.user?.displayName }) }}
    </p>

    <LoadingPlaceholder v-if="loading" variant="cards" class="mt-6" :count="6" />

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

    <EmptyState
      v-else
      class="mt-8"
      size="lg"
      :title="$t('plants.noneYet')"
      :description="$t('plants.getStarted')"
    >
      <RouterLink to="/plants/new" class="btn btn-primary">
        {{ $t('plants.addFirst') }}
      </RouterLink>
    </EmptyState>
  </div>
</template>
