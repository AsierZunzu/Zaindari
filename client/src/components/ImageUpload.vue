<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { validateImageFile } from '../utils/image'

const props = defineProps<{
  currentImageUrl?: string
}>()

const emit = defineEmits<{
  'file-selected': [file: File]
}>()

const { t } = useI18n()

const fileInput = ref<HTMLInputElement | null>(null)
const previewUrl = ref<string | null>(null)
const fileError = ref('')

watch(
  () => props.currentImageUrl,
  (url) => {
    if (url && !previewUrl.value) {
      previewUrl.value = url
    }
  },
  { immediate: true }
)

function triggerFileInput() {
  fileInput.value?.click()
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  // Reset so re-picking the same file still fires a change event, letting the
  // user retry after shrinking it.
  input.value = ''

  const validationError = validateImageFile(file)
  if (validationError) {
    // Leave any previously selected file and its preview in place -- clearing
    // them would silently discard a good photo because of a bad second pick.
    fileError.value = t(
      `errors.${validationError.code}`,
      validationError.params ?? {},
    )
    return
  }

  fileError.value = ''
  previewUrl.value = URL.createObjectURL(file)
  emit('file-selected', file)
}
</script>

<template>
  <div>
    <button
      type="button"
      class="relative w-full overflow-hidden rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 transition-colors hover:border-primary-400 hover:bg-primary-50"
      @click="triggerFileInput"
    >
      <div class="aspect-[4/3] w-full">
        <img
          v-if="previewUrl"
          :src="previewUrl"
          :alt="$t('plants.previewAlt')"
          class="h-full w-full object-cover"
        />
        <div v-else class="flex h-full w-full flex-col items-center justify-center text-gray-400">
          <svg class="mb-2 h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
            />
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <span class="text-sm font-medium">{{ $t('plants.tapToAddPhoto') }}</span>
        </div>
      </div>

      <!-- Overlay icon when image exists -->
      <div
        v-if="previewUrl"
        class="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity hover:opacity-100"
      >
        <svg class="h-10 w-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
          />
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </div>
    </button>

    <p v-if="fileError" class="mt-2 text-sm text-red-700">
      {{ fileError }}
    </p>

    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      capture="environment"
      class="hidden"
      @change="handleFileChange"
    />
  </div>
</template>
