<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { plantsApi } from '../api/plants'
import ImageUpload from '../components/ImageUpload.vue'

const route = useRoute()
const router = useRouter()

const plantId = computed(() => route.params.id as string | undefined)
const isEditing = computed(() => !!plantId.value)

const name = ref('')
const location = ref('')
const instructions = ref('')
const currentImageUrl = ref<string | undefined>(undefined)
const selectedFile = ref<File | null>(null)
const loading = ref(false)
const fetchLoading = ref(false)
const error = ref('')

onMounted(async () => {
  if (isEditing.value && plantId.value) {
    fetchLoading.value = true
    try {
      const plant = await plantsApi.get(plantId.value)
      name.value = plant.name
      location.value = plant.location ?? ''
      instructions.value = plant.instructions ?? ''
      if (plant.currentImage) {
        currentImageUrl.value = `/api/images/${plant.currentImage.id}`
      }
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Failed to load plant'
    } finally {
      fetchLoading.value = false
    }
  }
})

function handleFileSelected(file: File) {
  selectedFile.value = file
}

async function handleSubmit() {
  error.value = ''
  if (!name.value.trim()) {
    error.value = 'Plant name is required'
    return
  }

  loading.value = true
  try {
    const data = {
      name: name.value.trim(),
      location: location.value.trim() || undefined,
      instructions: instructions.value.trim() || undefined,
    }

    let id: string
    if (isEditing.value && plantId.value) {
      await plantsApi.update(plantId.value, data)
      id = plantId.value
    } else {
      const plant = await plantsApi.create(data)
      id = plant.id
    }

    if (selectedFile.value) {
      await plantsApi.uploadImage(id, selectedFile.value)
    }

    router.push(`/plants/${id}`)
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to save plant'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-lg">
    <h1 class="text-2xl font-bold text-gray-900">
      {{ isEditing ? 'Edit Plant' : 'Add New Plant' }}
    </h1>

    <div v-if="fetchLoading" class="mt-12 flex justify-center">
      <div class="h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
    </div>

    <form v-else class="mt-6 space-y-6" @submit.prevent="handleSubmit">
      <div v-if="error" class="rounded-md bg-red-50 p-3 text-sm text-red-700">
        {{ error }}
      </div>

      <!-- Image upload -->
      <div>
        <label class="mb-2 block text-sm font-medium text-gray-700">Photo</label>
        <ImageUpload
          :current-image-url="currentImageUrl"
          @file-selected="handleFileSelected"
        />
      </div>

      <!-- Name -->
      <div>
        <label for="plant-name" class="block text-sm font-medium text-gray-700">Name</label>
        <input
          id="plant-name"
          v-model="name"
          type="text"
          required
          class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          placeholder="My plant"
        />
      </div>

      <!-- Location -->
      <div>
        <label for="plant-location" class="block text-sm font-medium text-gray-700">Location</label>
        <input
          id="plant-location"
          v-model="location"
          type="text"
          class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          placeholder="e.g., Living room"
        />
      </div>

      <!-- Instructions -->
      <div>
        <label for="plant-instructions" class="block text-sm font-medium text-gray-700">Instructions</label>
        <textarea
          id="plant-instructions"
          v-model="instructions"
          rows="3"
          class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          placeholder="Care notes, tips..."
        />
      </div>

      <!-- Buttons -->
      <div class="flex gap-3">
        <button
          type="submit"
          :disabled="loading"
          class="flex-1 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {{ loading ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Plant' }}
        </button>
        <button
          type="button"
          class="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          @click="router.back()"
        >
          Cancel
        </button>
      </div>
    </form>
  </div>
</template>
