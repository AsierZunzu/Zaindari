import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { plantsApi } from '../api/plants'
import type { PlantWithImage } from '../api/plants'

export const usePlantsStore = defineStore('plants', () => {
  const plants = ref<PlantWithImage[]>([])
  const loading = ref(false)

  const sortedPlants = computed(() =>
    [...plants.value].sort((a, b) => a.name.localeCompare(b.name))
  )

  async function fetchPlants() {
    loading.value = true
    try {
      plants.value = await plantsApi.list()
    } finally {
      loading.value = false
    }
  }

  async function createPlant(data: { name: string; location?: string; instructions?: string }) {
    const plant = await plantsApi.create(data)
    return plant
  }

  async function updatePlant(id: string, data: { name?: string; location?: string; instructions?: string }) {
    const plant = await plantsApi.update(id, data)
    return plant
  }

  async function deletePlant(id: string) {
    await plantsApi.delete(id)
    plants.value = plants.value.filter((p) => p.id !== id)
  }

  return {
    plants,
    loading,
    sortedPlants,
    fetchPlants,
    createPlant,
    updatePlant,
    deletePlant,
  }
})
