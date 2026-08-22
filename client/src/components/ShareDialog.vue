<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import { ref, watch } from 'vue'
import { plantsApi } from '../api/plants'
import { useApiError } from '../composables/useApiError'

const props = defineProps<{
  plantId: string
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const { apiErrorMessage } = useApiError()

const shares = ref<Array<{ userId: string; username: string; displayName: string }>>([])
const userIdInput = ref('')
const loading = ref(false)
const error = ref('')

watch(
  () => props.visible,
  async (isVisible) => {
    if (isVisible) {
      error.value = ''
      userIdInput.value = ''
      await loadShares()
    }
  }
)

async function loadShares() {
  loading.value = true
  try {
    shares.value = await plantsApi.getShares(props.plantId)
  } catch (e: unknown) {
    error.value = apiErrorMessage(e, 'errors.plants.loadSharesFailed')
  } finally {
    loading.value = false
  }
}

async function addShare() {
  if (!userIdInput.value.trim()) return
  error.value = ''
  try {
    await plantsApi.share(props.plantId, userIdInput.value.trim())
    userIdInput.value = ''
    await loadShares()
  } catch (e: unknown) {
    error.value = apiErrorMessage(e, 'errors.plants.shareFailed')
  }
}

async function removeShare(userId: string) {
  try {
    await plantsApi.unshare(props.plantId, userId)
    shares.value = shares.value.filter((s) => s.userId !== userId)
  } catch (e: unknown) {
    error.value = apiErrorMessage(e, 'errors.plants.removeShareFailed')
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <!-- Overlay -->
      <div class="absolute inset-0 bg-ink/40" @click="emit('close')" />

      <!-- Dialog -->
      <div class="relative w-full max-w-md rounded-lg border border-line bg-surface p-6 shadow-lift">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="font-display text-lg font-semibold text-ink">{{ $t('plants.shareTitle') }}</h2>
          <!-- Both icon buttons in this dialog were unlabelled: a screen reader
               announced two identical, nameless controls. -->
          <button
            class="rounded-md p-1 text-ink-faint transition-colors hover:text-ink"
            :aria-label="$t('common.close')"
            @click="emit('close')"
          >
            <AppIcon name="close" :size="20" />
          </button>
        </div>

        <div v-if="error" class="mb-4 rounded-md bg-overdue-soft px-3 py-2.5 text-sm text-overdue-ink">
          {{ error }}
        </div>

        <!-- Add share -->
        <form class="mb-4 flex gap-2" @submit.prevent="addShare">
          <input
            v-model="userIdInput"
            type="text"
            :placeholder="$t('plants.userIdPlaceholder')"
            class="field-input flex-1"
          />
          <button
            type="submit"
            class="btn btn-primary"
          >
            {{ $t('plants.share') }}
          </button>
        </form>

        <!-- Current shares -->
        <div v-if="loading" class="py-4 text-center text-sm text-ink-faint">{{ $t('common.loading') }}</div>
        <div v-else-if="shares.length === 0" class="py-4 text-center text-sm text-ink-faint">
          {{ $t('plants.notSharedYet') }}
        </div>
        <ul v-else class="space-y-2">
          <li
            v-for="share in shares"
            :key="share.userId"
            class="card-inset flex items-center justify-between px-3 py-2"
          >
            <div>
              <span class="text-sm font-semibold text-ink">{{ share.displayName }}</span>
              <span class="ml-1 text-xs text-ink-faint">@{{ share.username }}</span>
            </div>
            <button
              class="rounded-sm p-1 text-ink-faint transition-colors hover:text-overdue-ink"
              :aria-label="$t('plants.removeShare')"
              @click="removeShare(share.userId)"
            >
              <AppIcon name="close" :size="16" />
            </button>
          </li>
        </ul>
      </div>
    </div>
  </Teleport>
</template>
