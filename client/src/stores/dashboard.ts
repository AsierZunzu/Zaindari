import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { dashboardApi } from '../api/dashboard'
import type { DashboardPlant } from '../types'

export const useDashboardStore = defineStore('dashboard', () => {
  const dashboardPlants = ref<DashboardPlant[]>([])
  const loading = ref(false)
  const error = ref('')

  const sortedPlants = computed(() =>
    [...dashboardPlants.value].sort((a, b) => {
      // Plants with overdue tasks first, then by pending count, then alphabetical
      const aOverdue = a.pendingTasks.filter(
        (t) => new Date(t.dueAt).getTime() < Date.now(),
      ).length
      const bOverdue = b.pendingTasks.filter(
        (t) => new Date(t.dueAt).getTime() < Date.now(),
      ).length
      if (aOverdue !== bOverdue) return bOverdue - aOverdue
      if (a.pendingTasks.length !== b.pendingTasks.length)
        return b.pendingTasks.length - a.pendingTasks.length
      return a.plant.name.localeCompare(b.plant.name)
    }),
  )

  async function fetchDashboard() {
    loading.value = true
    error.value = ''
    try {
      dashboardPlants.value = await dashboardApi.get()
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Failed to load dashboard'
    } finally {
      loading.value = false
    }
  }

  function removePendingTask(plantId: string, taskId: string) {
    const plant = dashboardPlants.value.find((p) => p.plant.id === plantId)
    if (plant) {
      plant.pendingTasks = plant.pendingTasks.filter((t) => t.id !== taskId)
    }
  }

  return {
    dashboardPlants,
    loading,
    error,
    sortedPlants,
    fetchDashboard,
    removePendingTask,
  }
})
