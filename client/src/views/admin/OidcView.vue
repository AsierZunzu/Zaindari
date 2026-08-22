<script setup lang="ts">
import EmptyState from '../../components/EmptyState.vue'
import LoadingPlaceholder from '../../components/LoadingPlaceholder.vue'
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
      <h2 class="font-display text-xl font-semibold text-ink">{{ $t('admin.oidc.title') }}</h2>
      <p class="text-xs text-ink-faint">{{ $t('admin.oidc.subtitle') }}</p>
    </div>

    <!-- Messages -->
    <div v-if="error" class="mb-4 rounded-md bg-overdue-soft px-3 py-2.5 text-sm text-overdue-ink">{{ error }}</div>
    <div v-if="success" class="mb-4 rounded-md bg-done-soft px-3 py-2.5 text-sm text-done-ink">{{ success }}</div>

    <!-- Loading -->
    <LoadingPlaceholder v-if="loading" :count="3" />

    <div v-if="!loading" class="card p-6">
      <!-- No config, show setup prompt -->
      <EmptyState v-if="!config && !isEditing" icon="key" :title="$t('admin.oidc.empty')">
        <button class="btn btn-primary" @click="startEdit">
          {{ $t('admin.oidc.configure') }}
        </button>
      </EmptyState>

      <!-- Show current config (read-only) -->
      <div v-else-if="config && !isEditing">
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-sm font-semibold text-ink">{{ $t('admin.oidc.providerName') }}</span>
            <span class="text-sm text-ink">{{ config.name }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm font-semibold text-ink">{{ $t('admin.oidc.issuerUrl') }}</span>
            <span class="max-w-xs truncate text-sm text-ink" :title="config.issuerUrl">{{ config.issuerUrl }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm font-semibold text-ink">{{ $t('admin.oidc.clientId') }}</span>
            <span class="max-w-xs truncate text-sm text-ink">{{ config.clientId }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm font-semibold text-ink">{{ $t('admin.oidc.clientSecret') }}</span>
            <span class="text-sm text-ink-faint">{{ config.clientSecret }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm font-semibold text-ink">{{ $t('admin.oidc.status') }}</span>
            <span
              :class="config.enabled ? 'bg-green-100 text-green-700' : 'bg-idle-soft text-idle-ink'"
              class="badge"
            >
              {{ config.enabled ? $t('admin.oidc.enabled') : $t('admin.oidc.disabled') }}
            </span>
          </div>
        </div>
        <div class="mt-6 flex gap-2">
          <button
            @click="startEdit"
            class="btn btn-primary"
          >
            {{ $t('common.edit') }}
          </button>
          <button
            @click="deleteConfig"
            class="btn btn-danger"
          >
            {{ $t('common.delete') }}
          </button>
        </div>
      </div>

      <!-- Edit form -->
      <div v-else>
        <form @submit.prevent="saveConfig" class="space-y-4">
          <div>
            <label class="field-label">{{ $t('admin.oidc.providerName') }}</label>
            <input
              v-model="form.name"
              type="text"
              required
              :placeholder="$t('admin.oidc.providerNamePlaceholder')"
              class="field-input mt-1"
            />
          </div>
          <div>
            <label class="field-label">{{ $t('admin.oidc.issuerUrl') }}</label>
            <input
              v-model="form.issuerUrl"
              type="url"
              required
              :placeholder="$t('admin.oidc.issuerUrlPlaceholder')"
              class="field-input mt-1"
            />
          </div>
          <div>
            <label class="field-label">{{ $t('admin.oidc.clientId') }}</label>
            <input
              v-model="form.clientId"
              type="text"
              required
              :placeholder="$t('admin.oidc.clientIdPlaceholder')"
              class="field-input mt-1"
            />
          </div>
          <div>
            <label class="field-label">
              {{ $t('admin.oidc.clientSecret') }}
              {{ config ? $t('admin.oidc.clientSecretKeepCurrent') : '' }}
            </label>
            <input
              v-model="form.clientSecret"
              type="password"
              :required="!config"
              class="field-input mt-1"
            />
          </div>
          <div class="flex items-center gap-2">
            <input
              v-model="form.enabled"
              type="checkbox"
              id="oidcEnabled"
              class="size-4 rounded-sm border-line-strong text-primary-700 focus:ring-primary-400"
            />
            <label for="oidcEnabled" class="text-sm text-ink-muted">{{ $t('admin.oidc.enabled') }}</label>
          </div>
          <div class="flex gap-2 pt-2">
            <button
              type="submit"
              :disabled="saving"
              class="btn btn-primary"
            >
              {{ saving ? $t('common.saving') : $t('common.save') }}
            </button>
            <button
              type="button"
              @click="cancelEdit"
              class="btn btn-quiet"
            >
              {{ $t('common.cancel') }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
