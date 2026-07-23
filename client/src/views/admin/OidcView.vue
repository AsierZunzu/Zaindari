<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { adminApi } from '../../api/admin'
import { useApiError } from '../../composables/useApiError'
import type { OidcConfig, OidcConfigInput } from '../../api/admin'

const { t } = useI18n()
const { apiErrorMessage } = useApiError()

const config = ref<OidcConfig | null>(null)
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const success = ref('')

const form = ref<OidcConfigInput>({
  name: '',
  issuerUrl: '',
  clientId: '',
  clientSecret: '',
  enabled: true,
})

const isEditing = ref(false)

onMounted(() => fetchConfig())

async function fetchConfig() {
  loading.value = true
  error.value = ''
  try {
    config.value = await adminApi.getOidcConfig()
    if (config.value) {
      form.value = {
        name: config.value.name,
        issuerUrl: config.value.issuerUrl,
        clientId: config.value.clientId,
        clientSecret: '',
        enabled: config.value.enabled,
      }
    }
  } catch {
    // No config exists, that's fine
    config.value = null
  } finally {
    loading.value = false
  }
}

function startEdit() {
  isEditing.value = true
  if (!config.value) {
    form.value = {
      name: '',
      issuerUrl: '',
      clientId: '',
      clientSecret: '',
      enabled: true,
    }
  }
}

function cancelEdit() {
  isEditing.value = false
  if (config.value) {
    form.value = {
      name: config.value.name,
      issuerUrl: config.value.issuerUrl,
      clientId: config.value.clientId,
      clientSecret: '',
      enabled: config.value.enabled,
    }
  }
}

async function saveConfig() {
  saving.value = true
  error.value = ''
  success.value = ''
  try {
    const data: OidcConfigInput = {
      name: form.value.name,
      issuerUrl: form.value.issuerUrl,
      clientId: form.value.clientId,
      enabled: form.value.enabled,
    }
    if (form.value.clientSecret) {
      data.clientSecret = form.value.clientSecret
    }
    config.value = await adminApi.upsertOidcConfig(data)
    form.value.clientSecret = ''
    isEditing.value = false
    success.value = t('admin.oidc.saved')
    setTimeout(() => (success.value = ''), 3000)
  } catch (e: unknown) {
    error.value = apiErrorMessage(e, 'errors.admin.saveOidcFailed')
  } finally {
    saving.value = false
  }
}

async function deleteConfig() {
  if (!confirm(t('admin.oidc.deleteConfirm'))) return
  error.value = ''
  success.value = ''
  try {
    await adminApi.deleteOidcConfig()
    config.value = null
    form.value = { name: '', issuerUrl: '', clientId: '', clientSecret: '', enabled: true }
    isEditing.value = false
    success.value = t('admin.oidc.deleted')
    setTimeout(() => (success.value = ''), 3000)
  } catch (e: unknown) {
    error.value = apiErrorMessage(e, 'errors.admin.deleteOidcFailed')
  }
}
</script>

<template>
  <div>
    <div class="mb-4">
      <h2 class="text-lg font-semibold text-gray-900">{{ $t('admin.oidc.title') }}</h2>
      <p class="text-xs text-gray-500">{{ $t('admin.oidc.subtitle') }}</p>
    </div>

    <!-- Messages -->
    <div v-if="error" class="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700">{{ success }}</div>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-8">
      <div class="h-6 w-6 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
    </div>

    <div v-if="!loading" class="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
      <!-- No config, show setup prompt -->
      <div v-if="!config && !isEditing" class="text-center py-6">
        <div class="text-3xl mb-2">&#128273;</div>
        <p class="text-sm text-gray-500 mb-4">{{ $t('admin.oidc.empty') }}</p>
        <button
          @click="startEdit"
          class="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500"
        >
          {{ $t('admin.oidc.configure') }}
        </button>
      </div>

      <!-- Show current config (read-only) -->
      <div v-else-if="config && !isEditing">
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-gray-700">{{ $t('admin.oidc.providerName') }}</span>
            <span class="text-sm text-gray-900">{{ config.name }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-gray-700">{{ $t('admin.oidc.issuerUrl') }}</span>
            <span class="text-sm text-gray-900 truncate max-w-xs" :title="config.issuerUrl">{{ config.issuerUrl }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-gray-700">{{ $t('admin.oidc.clientId') }}</span>
            <span class="text-sm text-gray-900 truncate max-w-xs">{{ config.clientId }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-gray-700">{{ $t('admin.oidc.clientSecret') }}</span>
            <span class="text-sm text-gray-500">{{ config.clientSecret }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-gray-700">{{ $t('admin.oidc.status') }}</span>
            <span
              :class="config.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'"
              class="rounded-full px-2 py-0.5 text-xs font-medium"
            >
              {{ config.enabled ? $t('admin.oidc.enabled') : $t('admin.oidc.disabled') }}
            </span>
          </div>
        </div>
        <div class="mt-6 flex gap-2">
          <button
            @click="startEdit"
            class="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500"
          >
            {{ $t('common.edit') }}
          </button>
          <button
            @click="deleteConfig"
            class="rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100"
          >
            {{ $t('common.delete') }}
          </button>
        </div>
      </div>

      <!-- Edit form -->
      <div v-else>
        <form @submit.prevent="saveConfig" class="space-y-4">
          <div>
            <label class="block text-xs font-medium text-gray-700">{{ $t('admin.oidc.providerName') }}</label>
            <input
              v-model="form.name"
              type="text"
              required
              :placeholder="$t('admin.oidc.providerNamePlaceholder')"
              class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700">{{ $t('admin.oidc.issuerUrl') }}</label>
            <input
              v-model="form.issuerUrl"
              type="url"
              required
              :placeholder="$t('admin.oidc.issuerUrlPlaceholder')"
              class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700">{{ $t('admin.oidc.clientId') }}</label>
            <input
              v-model="form.clientId"
              type="text"
              required
              :placeholder="$t('admin.oidc.clientIdPlaceholder')"
              class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700">
              {{ $t('admin.oidc.clientSecret') }}
              {{ config ? $t('admin.oidc.clientSecretKeepCurrent') : '' }}
            </label>
            <input
              v-model="form.clientSecret"
              type="password"
              :required="!config"
              class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <div class="flex items-center gap-2">
            <input
              v-model="form.enabled"
              type="checkbox"
              id="oidcEnabled"
              class="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <label for="oidcEnabled" class="text-sm text-gray-700">{{ $t('admin.oidc.enabled') }}</label>
          </div>
          <div class="flex gap-2 pt-2">
            <button
              type="submit"
              :disabled="saving"
              class="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500 disabled:opacity-50"
            >
              {{ saving ? $t('common.saving') : $t('common.save') }}
            </button>
            <button
              type="button"
              @click="cancelEdit"
              class="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
            >
              {{ $t('common.cancel') }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
