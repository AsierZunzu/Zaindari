<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import { computed, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthedImage } from '../composables/useAuthedImage'
import { validateImageFile } from '../utils/image'

const props = defineProps<{
  currentImageUrl?: string
}>()

const emit = defineEmits<{
  'file-selected': [file: File]
}>()

const { t } = useI18n()

const fileInput = ref<HTMLInputElement | null>(null)
const fileError = ref('')

/**
 * The photo already on the plant. It lives behind the authenticated
 * `GET /api/images/:id`, so it has to be read through the api client and handed
 * over as an object URL -- an `<img src>` pointing straight at that endpoint is
 * a subresource load the browser makes without our Authorization header, which
 * earns a 401 and the broken-image glyph.
 */
const { src: storedUrl } = useAuthedImage(() => props.currentImageUrl)

/**
 * A freshly picked file, previewed straight from disk. Kept apart from the
 * stored photo rather than overwriting it: this one is ours to revoke, and once
 * a pick exists it wins, because the stored photo is what the pick replaces.
 */
const pickedUrl = ref<string | null>(null)

const previewUrl = computed(() => pickedUrl.value ?? storedUrl.value)

function releasePick() {
  if (pickedUrl.value) {
    URL.revokeObjectURL(pickedUrl.value)
    pickedUrl.value = null
  }
}

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
  releasePick()
  pickedUrl.value = URL.createObjectURL(file)
  emit('file-selected', file)
}

// Object URLs pin their blob in memory until revoked; a full-size camera photo
// would otherwise outlive the form that previewed it.
onUnmounted(releasePick)
</script>

<template>
  <div>
    <button
      type="button"
      class="relative w-full overflow-hidden rounded-lg border border-dashed border-line-strong bg-surface-sunk transition-colors hover:border-primary-400 hover:bg-primary-50"
      @click="triggerFileInput"
    >
      <div class="aspect-[4/3] w-full">
        <img
          v-if="previewUrl"
          :src="previewUrl"
          :alt="$t('plants.previewAlt')"
          class="h-full w-full object-cover"
        />
        <div v-else class="flex h-full w-full flex-col items-center justify-center gap-2 text-ink-faint">
          <AppIcon name="camera" :size="40" />
          <span class="text-sm font-medium">{{ $t('plants.tapToAddPhoto') }}</span>
        </div>
      </div>

      <!-- Overlay icon when image exists -->
      <div
        v-if="previewUrl"
        class="absolute inset-0 flex items-center justify-center bg-ink/40 opacity-0 transition-opacity hover:opacity-100"
      >
        <AppIcon name="camera" :size="36" class="text-ground" />
      </div>
    </button>

    <p v-if="fileError" class="mt-2 text-sm text-overdue-ink">
      {{ fileError }}
    </p>

    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      class="hidden"
      @change="handleFileChange"
    />
  </div>
</template>
