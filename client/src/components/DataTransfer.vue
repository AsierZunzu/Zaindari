<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useApiError } from '../composables/useApiError'
import { useImportNotes } from '../composables/useImportNotes'
import { useAuthStore } from '../stores/auth'
import { purgeApiCache } from '../sw-cache-key'
import { dataApi, type ImportMode, type ImportPreview, type ImportSummary } from '../api/data'

const { d } = useI18n()
const { apiErrorMessage } = useApiError()
const { importNote } = useImportNotes()
const auth = useAuthStore()

// ── Export ───────────────────────────────────────────────────────────

const exporting = ref(false)
const exportError = ref('')
const exportedName = ref('')

async function exportData() {
  if (exporting.value) return

  exporting.value = true
  exportError.value = ''
  exportedName.value = ''
  try {
    exportedName.value = await dataApi.export()
  } catch (err) {
    exportError.value = apiErrorMessage(err, 'errors.data.exportFailed')
  } finally {
    exporting.value = false
  }
}

// ── Import ───────────────────────────────────────────────────────────

const fileInput = ref<HTMLInputElement | null>(null)
const selected = ref<File | null>(null)
const preview = ref<ImportPreview | null>(null)
const summary = ref<ImportSummary | null>(null)
const mode = ref<ImportMode>('append')
const importError = ref('')
const busy = ref(false)

/** Replacing destroys data, so it takes a second, explicit confirmation. */
const confirmedReplace = ref(false)

const canImport = computed(
  () => !!preview.value && !busy.value && (mode.value === 'append' || confirmedReplace.value),
)

const exportedAt = computed(() => {
  const raw = preview.value?.manifest.exportedAt
  if (!raw) return ''
  const date = new Date(raw)
  // With the year: a backup is often months old, and "12 Mar" alone is exactly
  // the ambiguity that makes someone restore the wrong file.
  return Number.isNaN(date.getTime()) ? '' : d(date, 'shortWithYear')
})

function resetImport() {
  selected.value = null
  preview.value = null
  summary.value = null
  importError.value = ''
  mode.value = 'append'
  confirmedReplace.value = false
  if (fileInput.value) fileInput.value.value = ''
}

/**
 * Reading the file happens as soon as it is picked, not on submit: it is the
 * only way to tell the user what the bundle holds — and how many plants a
 * replace would destroy — before they commit to anything.
 */
async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  selected.value = file
  preview.value = null
  summary.value = null
  importError.value = ''
  confirmedReplace.value = false

  busy.value = true
  try {
    preview.value = await dataApi.preview(file)
  } catch (err) {
    importError.value = apiErrorMessage(err, 'errors.data.importFailed')
    selected.value = null
  } finally {
    busy.value = false
  }
}

async function runImport() {
  if (!selected.value || !canImport.value) return

  busy.value = true
  importError.value = ''
  try {
    summary.value = await dataApi.import(selected.value, mode.value)

    // The service worker holds this account's previous plant lists under a
    // NetworkFirst cache; leaving them would show the pre-import garden the
    // next time the app opens offline.
    await purgeApiCache()

    // A replace restores the account's settings too, so re-read the profile:
    // the language may have just changed underneath us.
    if (mode.value === 'replace') {
      await auth.initialize()
    }

    preview.value = null
    selected.value = null
    if (fileInput.value) fileInput.value.value = ''
  } catch (err) {
    importError.value = apiErrorMessage(err, 'errors.data.importFailed')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="mt-4 rounded-lg border border-gray-200 bg-white p-5">
    <h2 class="mb-1 text-lg font-semibold text-gray-800">
      {{ $t('settings.data.title') }}
    </h2>
    <p class="mb-4 text-xs text-gray-500">{{ $t('settings.data.hint') }}</p>

    <!-- Export -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="text-sm font-medium text-gray-700">
          {{ $t('settings.data.exportTitle') }}
        </p>
        <p class="mt-0.5 text-xs text-gray-500">
          {{ $t('settings.data.exportHint') }}
        </p>
      </div>
      <button
        type="button"
        :disabled="exporting"
        class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-400 disabled:cursor-not-allowed disabled:opacity-50"
        @click="exportData"
      >
        {{ exporting ? $t('settings.data.exporting') : $t('settings.data.exportAction') }}
      </button>
    </div>

    <div v-if="exportError" class="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
      {{ exportError }}
    </div>
    <div
      v-else-if="exportedName"
      class="mt-3 rounded-md bg-green-50 p-3 text-sm text-green-700"
    >
      {{ $t('settings.data.exportDone', { filename: exportedName }) }}
    </div>

    <!-- Import -->
    <div class="mt-5 border-t border-gray-100 pt-5">
      <p class="text-sm font-medium text-gray-700">
        {{ $t('settings.data.importTitle') }}
      </p>
      <p class="mt-0.5 mb-3 text-xs text-gray-500">
        {{ $t('settings.data.importHint') }}
      </p>

      <label for="import-bundle" class="sr-only">
        {{ $t('settings.data.importTitle') }}
      </label>
      <input
        id="import-bundle"
        ref="fileInput"
        type="file"
        accept=".zip,application/zip"
        :disabled="busy"
        class="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border file:border-gray-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-50 disabled:opacity-50"
        @change="handleFileChange"
      />

      <!-- What the file holds, shown before anything is committed -->
      <div v-if="preview" class="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3">
        <p v-if="exportedAt" class="text-sm text-gray-700">
          {{
            $t('settings.data.previewOrigin', {
              user: preview.manifest.user.displayName || preview.manifest.user.username,
              date: exportedAt,
            })
          }}
        </p>

        <!-- Counts are labelled rather than written into a sentence. Two
             independent numbers cannot share one plural rule, and splitting a
             sentence into fragments to get around that is untranslatable. -->
        <dl class="mt-2 flex gap-6">
          <div>
            <dt class="text-xs text-gray-500">{{ $t('settings.data.statPlants') }}</dt>
            <dd class="text-sm font-medium text-gray-800">{{ preview.plants }}</dd>
          </div>
          <div>
            <dt class="text-xs text-gray-500">{{ $t('settings.data.statPhotos') }}</dt>
            <dd class="text-sm font-medium text-gray-800">{{ preview.images }}</dd>
          </div>
        </dl>

        <fieldset class="mt-3">
          <legend class="text-xs font-medium text-gray-700">
            {{ $t('settings.data.modeLegend') }}
          </legend>

          <label class="mt-2 flex items-start gap-2 text-sm text-gray-700">
            <input
              v-model="mode"
              type="radio"
              value="append"
              class="mt-0.5 border-gray-300 text-primary-600 focus:ring-primary-400"
            />
            <span>
              {{ $t('settings.data.modeAppend') }}
              <span class="block text-xs text-gray-500">
                {{ $t('settings.data.modeAppendHint') }}
              </span>
            </span>
          </label>

          <label class="mt-2 flex items-start gap-2 text-sm text-gray-700">
            <input
              v-model="mode"
              type="radio"
              value="replace"
              class="mt-0.5 border-gray-300 text-primary-600 focus:ring-primary-400"
            />
            <span>
              {{ $t('settings.data.modeReplace') }}
              <span class="block text-xs text-gray-500">
                {{ $t('settings.data.modeReplaceHint') }}
              </span>
            </span>
          </label>
        </fieldset>

        <!-- Naming the number is the point: "delete everything" is abstract,
             "delete your 14 plants" is a decision someone can actually make. -->
        <div
          v-if="mode === 'replace'"
          class="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700"
        >
          <p>
            {{ $t('settings.data.replaceWarning', { count: preview.existingPlants }) }}
          </p>
          <label class="mt-2 flex items-center gap-2 text-xs font-medium">
            <input
              v-model="confirmedReplace"
              type="checkbox"
              class="rounded border-red-300 text-red-600 focus:ring-red-400"
            />
            {{ $t('settings.data.replaceConfirm') }}
          </label>
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            :disabled="!canImport"
            class="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-400 disabled:cursor-not-allowed disabled:opacity-50"
            :class="mode === 'replace' ? 'bg-red-600 hover:bg-red-700' : ''"
            @click="runImport"
          >
            {{ busy ? $t('settings.data.importing') : $t('settings.data.importAction') }}
          </button>
          <button
            type="button"
            :disabled="busy"
            class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-400 disabled:opacity-50"
            @click="resetImport"
          >
            {{ $t('common.cancel') }}
          </button>
        </div>
      </div>

      <div v-if="importError" class="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
        {{ importError }}
      </div>

      <div
        v-if="summary"
        class="mt-3 rounded-md bg-green-50 p-3 text-sm text-green-700"
      >
        <p class="font-medium">{{ $t('settings.data.importDone') }}</p>

        <dl class="mt-2 flex gap-6">
          <div>
            <dt class="text-xs opacity-80">{{ $t('settings.data.statPlants') }}</dt>
            <dd class="text-sm font-medium">{{ summary.plants }}</dd>
          </div>
          <div>
            <dt class="text-xs opacity-80">{{ $t('settings.data.statPhotos') }}</dt>
            <dd class="text-sm font-medium">{{ summary.images }}</dd>
          </div>
          <div v-if="summary.replacedPlants > 0">
            <dt class="text-xs opacity-80">{{ $t('settings.data.statReplaced') }}</dt>
            <dd class="text-sm font-medium">{{ summary.replacedPlants }}</dd>
          </div>
        </dl>

        <ul v-if="summary.skipped.length" class="mt-2 list-disc space-y-0.5 pl-5 text-xs">
          <li v-for="(note, index) in summary.skipped" :key="index">
            {{ importNote(note) }}
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
