<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { plantsApi } from '../api/plants'
import type { PlantWithImage } from '../api/plants'
import type { PlantImage } from '../types'
import ShareDialog from '../components/ShareDialog.vue'

const route = useRoute()
const router = useRouter()

const plantId = route.params.id as string
const plant = ref<PlantWithImage | null>(null)
const images = ref<PlantImage[]>([])
const loading = ref(true)
const error = ref('')
const showDeleteConfirm = ref(false)
const showShareDialog = ref(false)
const selectedImageUrl = ref<string | null>(null)

onMounted(async () => {
  try {
    const [plantData, imageData] = await Promise.all([
      plantsApi.get(plantId),
      plantsApi.getImages(plantId),
    ])
    plant.value = plantData
    images.value = imageData
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to load plant'
  } finally {
    loading.value = false
  }
})

async function handleDelete() {
  try {
    await plantsApi.delete(plantId)
    router.push('/')
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to delete plant'
    showDeleteConfirm.value = false
  }
}
</script>

<template>
  <div>
    <!-- Back button -->
    <button
      class="mb-4 inline-flex items-center gap-1 text-sm font-medium text-gray-500 transition-colors hover:text-gray-700"
      @click="router.push('/')"
    >
      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
      </svg>
      Back to dashboard
    </button>

    <!-- Loading -->
    <div v-if="loading" class="mt-12 flex justify-center">
      <div class="h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="rounded-md bg-red-50 p-4 text-sm text-red-700">
      {{ error }}
    </div>

    <!-- Plant detail -->
    <div v-else-if="plant">
      <!-- Hero image -->
      <div class="overflow-hidden rounded-xl bg-primary-50">
        <div class="aspect-[16/9] w-full">
          <img
            v-if="plant.currentImage"
            :src="`/api/images/${plant.currentImage.id}`"
            :alt="plant.name"
            class="h-full w-full object-cover"
          />
          <div v-else class="flex h-full w-full items-center justify-center">
            <span class="text-8xl">&#127793;</span>
          </div>
        </div>
      </div>

      <!-- Plant info -->
      <div class="mt-6">
        <div class="flex items-start justify-between">
          <div>
            <h1 class="text-2xl font-bold text-gray-900">{{ plant.name }}</h1>
            <p v-if="plant.location" class="mt-1 flex items-center gap-1 text-sm text-gray-500">
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {{ plant.location }}
            </p>
          </div>

          <!-- Action buttons -->
          <div class="flex gap-2">
            <RouterLink
              :to="`/plants/${plant.id}/edit`"
              class="rounded-lg border border-gray-300 bg-white p-2 text-gray-600 shadow-sm transition-colors hover:bg-gray-50"
              title="Edit"
            >
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </RouterLink>
            <button
              class="rounded-lg border border-gray-300 bg-white p-2 text-gray-600 shadow-sm transition-colors hover:bg-gray-50"
              title="Share"
              @click="showShareDialog = true"
            >
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <button
              class="rounded-lg border border-red-200 bg-white p-2 text-red-500 shadow-sm transition-colors hover:bg-red-50"
              title="Delete"
              @click="showDeleteConfirm = true"
            >
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Instructions -->
        <div v-if="plant.instructions" class="mt-6 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <h2 class="mb-2 text-sm font-semibold text-gray-700">Care Instructions</h2>
          <p class="whitespace-pre-line text-sm text-gray-600">{{ plant.instructions }}</p>
        </div>

        <!-- Tasks placeholder -->
        <div class="mt-6 rounded-xl border-2 border-dashed border-gray-200 bg-white p-6 text-center">
          <span class="text-3xl">&#128197;</span>
          <p class="mt-2 text-sm text-gray-500">Tasks coming in Phase 3</p>
        </div>

        <!-- Image history -->
        <div v-if="images.length > 1" class="mt-6">
          <h2 class="mb-3 text-sm font-semibold text-gray-700">Image History</h2>
          <div class="grid grid-cols-4 gap-2 sm:grid-cols-6">
            <button
              v-for="img in images"
              :key="img.id"
              class="overflow-hidden rounded-lg ring-2 transition-all"
              :class="selectedImageUrl === `/api/images/${img.id}` ? 'ring-primary-500' : 'ring-transparent hover:ring-gray-300'"
              @click="selectedImageUrl = selectedImageUrl === `/api/images/${img.id}` ? null : `/api/images/${img.id}`"
            >
              <div class="aspect-square">
                <img
                  :src="`/api/images/${img.id}`"
                  :alt="`${plant.name} photo`"
                  class="h-full w-full object-cover"
                />
              </div>
            </button>
          </div>

          <!-- Full size preview -->
          <div v-if="selectedImageUrl" class="mt-3 overflow-hidden rounded-xl">
            <img
              :src="selectedImageUrl"
              :alt="plant.name"
              class="w-full rounded-xl object-contain"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Delete confirmation dialog -->
    <Teleport to="body">
      <div v-if="showDeleteConfirm" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50" @click="showDeleteConfirm = false" />
        <div class="relative w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
          <h2 class="text-lg font-bold text-gray-900">Delete Plant</h2>
          <p class="mt-2 text-sm text-gray-600">
            Are you sure you want to delete <strong>{{ plant?.name }}</strong>? This action cannot be undone.
          </p>
          <div class="mt-4 flex justify-end gap-3">
            <button
              class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
              @click="showDeleteConfirm = false"
            >
              Cancel
            </button>
            <button
              class="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-500"
              @click="handleDelete"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Share dialog -->
    <ShareDialog
      v-if="plant"
      :plant-id="plant.id"
      :visible="showShareDialog"
      @close="showShareDialog = false"
    />
  </div>
</template>
