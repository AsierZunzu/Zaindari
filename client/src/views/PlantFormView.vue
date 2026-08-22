<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { plantsApi } from '../api/plants'
import { useI18n } from 'vue-i18n'
import { useApiError } from '../composables/useApiError'
import ImageUpload from '../components/ImageUpload.vue'
import LoadingPlaceholder from '../components/LoadingPlaceholder.vue'

const route = useRoute()
const router = useRouter()

const { t } = useI18n()
const { apiErrorMessage } = useApiError()

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
      error.value = apiErrorMessage(e, 'errors.plants.loadFailed')
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
    error.value = t('plants.nameRequired')
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
    error.value = apiErrorMessage(e, 'errors.plants.saveFailed')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-lg">
    <h1 class="font-display text-3xl font-semibold text-ink">
      {{ isEditing ? $t('plants.edit') : $t('plants.addNew') }}
    </h1>

    <LoadingPlaceholder v-if="fetchLoading" class="mt-6" :count="2" />

    <form v-else class="mt-6 space-y-6" @submit.prevent="handleSubmit">
      <div v-if="error" class="rounded-md bg-overdue-soft px-3 py-2.5 text-sm text-overdue-ink">
        {{ error }}
      </div>

      <!-- Image upload -->
      <div>
        <label class="field-label">{{ $t('plants.photo') }}</label>
        <ImageUpload
          :current-image-url="currentImageUrl"
          @file-selected="handleFileSelected"
        />
      </div>

      <!-- Name -->
      <div>
        <label for="plant-name" class="field-label">{{ $t('plants.name') }}</label>
        <input
          id="plant-name"
          v-model="name"
          type="text"
          required
          class="field-input mt-1"
          :placeholder="$t('plants.namePlaceholder')"
        />
      </div>

      <!-- Location -->
      <div>
        <label for="plant-location" class="field-label">{{ $t('plants.location') }}</label>
        <input
          id="plant-location"
          v-model="location"
          type="text"
          class="field-input mt-1"
          :placeholder="$t('plants.locationPlaceholder')"
        />
      </div>

      <!-- Instructions -->
      <div>
        <label for="plant-instructions" class="field-label">{{ $t('plants.instructions') }}</label>
        <textarea
          id="plant-instructions"
          v-model="instructions"
          rows="3"
          class="field-input mt-1"
          :placeholder="$t('plants.instructionsPlaceholder')"
        />
      </div>

      <!-- Buttons -->
      <div class="flex gap-3">
        <button
          type="submit"
          :disabled="loading"
          class="btn btn-primary flex-1"
        >
          {{ loading ? $t('common.saving') : isEditing ? $t('common.saveChanges') : $t('plants.addPlant') }}
        </button>
        <button
          type="button"
          class="btn btn-quiet"
          @click="router.back()"
        >
          {{ $t('common.cancel') }}
        </button>
      </div>
    </form>
  </div>
</template>
