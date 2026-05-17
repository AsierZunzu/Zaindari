<script setup lang="ts">
import { ref, watch } from 'vue'
import { plantsApi } from '../api/plants'

const props = defineProps<{
  plantId: string
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

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
    error.value = e instanceof Error ? e.message : 'Failed to load shares'
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
    error.value = e instanceof Error ? e.message : 'Failed to share'
  }
}

async function removeShare(userId: string) {
  try {
    await plantsApi.unshare(props.plantId, userId)
    shares.value = shares.value.filter((s) => s.userId !== userId)
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to remove share'
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <!-- Overlay -->
      <div class="absolute inset-0 bg-black/50" @click="emit('close')" />

      <!-- Dialog -->
      <div class="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-lg font-bold text-gray-900">Share Plant</h2>
          <button
            class="rounded-md p-1 text-gray-400 hover:text-gray-600"
            @click="emit('close')"
          >
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div v-if="error" class="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {{ error }}
        </div>

        <!-- Add share -->
        <form class="mb-4 flex gap-2" @submit.prevent="addShare">
          <input
            v-model="userIdInput"
            type="text"
            placeholder="Enter user ID"
            class="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          <button
            type="submit"
            class="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-500"
          >
            Share
          </button>
        </form>

        <!-- Current shares -->
        <div v-if="loading" class="py-4 text-center text-sm text-gray-500">Loading...</div>
        <div v-else-if="shares.length === 0" class="py-4 text-center text-sm text-gray-500">
          Not shared with anyone yet.
        </div>
        <ul v-else class="space-y-2">
          <li
            v-for="share in shares"
            :key="share.userId"
            class="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
          >
            <div>
              <span class="text-sm font-medium text-gray-900">{{ share.displayName }}</span>
              <span class="ml-1 text-xs text-gray-500">@{{ share.username }}</span>
            </div>
            <button
              class="rounded p-1 text-gray-400 transition-colors hover:text-red-500"
              @click="removeShare(share.userId)"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </li>
        </ul>
      </div>
    </div>
  </Teleport>
</template>
