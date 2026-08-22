<script setup lang="ts">
import LoadingPlaceholder from '../../components/LoadingPlaceholder.vue'
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { adminApi } from '../../api/admin'
import { useApiError } from '../../composables/useApiError'
import type { AppConfigEntry } from '../../api/admin'

const { t } = useI18n()
const { apiErrorMessage } = useApiError()

const entries = ref<AppConfigEntry[]>([])
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const success = ref('')

// Editable state: key -> value
const editValues = ref<Record<string, string>>({})

// New entry
const newKey = ref('')
const newValue = ref('')

onMounted(() => fetchConfig())

async function fetchConfig() {
  loading.value = true
  error.value = ''
  try {
    entries.value = await adminApi.getConfig()
    editValues.value = {}
    for (const entry of entries.value) {
      editValues.value[entry.key] = entry.value
    }
  } catch (e: unknown) {
    error.value = apiErrorMessage(e, 'errors.admin.loadConfigFailed')
  } finally {
    loading.value = false
  }
}

async function saveAll() {
  saving.value = true
  error.value = ''
  success.value = ''
  try {
    entries.value = await adminApi.updateConfig(editValues.value)
    editValues.value = {}
    for (const entry of entries.value) {
      editValues.value[entry.key] = entry.value
    }
    success.value = t('admin.config.saved')
    setTimeout(() => (success.value = ''), 3000)
  } catch (e: unknown) {
    error.value = apiErrorMessage(e, 'errors.admin.saveConfigFailed')
  } finally {
    saving.value = false
  }
}

async function addEntry() {
  if (!newKey.value.trim()) return
  editValues.value[newKey.value.trim()] = newValue.value
  newKey.value = ''
  newValue.value = ''
  await saveAll()
}

function removeEntry(key: string) {
  // To remove, we just delete from editValues - but since the backend
  // only upserts, we need to save without this key. For now, we mark it
  // visually and they can manage it in DB.
  delete editValues.value[key]
  entries.value = entries.value.filter((e) => e.key !== key)
}
</script>

<template>
  <div>
    <div class="mb-4">
      <h2 class="font-display text-xl font-semibold text-ink">{{ $t('admin.config.title') }}</h2>
      <p class="text-xs text-ink-faint">{{ $t('admin.config.subtitle') }}</p>
    </div>

    <!-- Messages -->
    <div v-if="error" class="mb-4 rounded-md bg-overdue-soft px-3 py-2.5 text-sm text-overdue-ink">{{ error }}</div>
    <div v-if="success" class="mb-4 rounded-md bg-done-soft px-3 py-2.5 text-sm text-done-ink">{{ success }}</div>

    <!-- Loading -->
    <LoadingPlaceholder v-if="loading" :count="3" />

    <div v-if="!loading" class="space-y-4">
      <!-- Existing entries -->
      <div class="card p-6">
        <div v-if="Object.keys(editValues).length === 0" class="py-4 text-center text-sm text-ink-faint">
          {{ $t('admin.config.empty') }}
        </div>
        <div v-else class="space-y-3">
          <div v-for="key in Object.keys(editValues)" :key="key" class="flex items-center gap-3">
            <label class="w-48 shrink-0 truncate text-sm font-semibold text-ink" :title="key">
              {{ key }}
            </label>
            <input
              v-model="editValues[key]"
              type="text"
              class="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            <button
              @click="removeEntry(key)"
              class="text-xs font-semibold text-overdue-ink hover:underline"
            >
              {{ $t('common.remove') }}
            </button>
          </div>
        </div>

        <div class="mt-4 flex justify-end">
          <button
            @click="saveAll"
            :disabled="saving"
            class="btn btn-primary"
          >
            {{ saving ? $t('common.saving') : $t('common.saveChanges') }}
          </button>
        </div>
      </div>

      <!-- Add new entry -->
      <div class="card p-6">
        <h3 class="section-label mb-3">{{ $t('admin.config.addHeading') }}</h3>
        <form @submit.prevent="addEntry" class="flex items-end gap-3">
          <div class="flex-1">
            <label class="field-label">{{ $t('admin.config.key') }}</label>
            <input
              v-model="newKey"
              type="text"
              required
              :placeholder="$t('admin.config.keyPlaceholder')"
              class="field-input mt-1 py-1.5"
            />
          </div>
          <div class="flex-1">
            <label class="field-label">{{ $t('admin.config.value') }}</label>
            <input
              v-model="newValue"
              type="text"
              :placeholder="$t('admin.config.valuePlaceholder')"
              class="field-input mt-1 py-1.5"
            />
          </div>
          <button
            type="submit"
            class="btn btn-quiet"
          >
            {{ $t('common.add') }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>
