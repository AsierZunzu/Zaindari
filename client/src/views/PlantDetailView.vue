<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { plantsApi } from '../api/plants'
import { tasksApi } from '../api/tasks'
import type { PlantWithImage } from '../api/plants'
import type { PlantImage, Task } from '../types'
import { useApiError } from '../composables/useApiError'
import AppIcon from '../components/AppIcon.vue'
import AuthedImage from '../components/AuthedImage.vue'
import SegmentedControl from '../components/SegmentedControl.vue'
import ShareDialog from '../components/ShareDialog.vue'
import TaskList from '../components/TaskList.vue'
import LoadingPlaceholder from '../components/LoadingPlaceholder.vue'
import ScheduleEditor from '../components/ScheduleEditor.vue'

type Pane = 'tasks' | 'schedules' | 'photos'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const { apiErrorMessage } = useApiError()

const plantId = route.params.id as string
const plant = ref<PlantWithImage | null>(null)
const images = ref<PlantImage[]>([])
const loading = ref(true)
const error = ref('')
const tasks = ref<Task[]>([])
const showDeleteConfirm = ref(false)
const showShareDialog = ref(false)
const selectedImageUrl = ref<string | null>(null)

/**
 * The page used to be one long scroll of six sections that all looked alike.
 * They are three different questions — what needs doing, how often it should
 * happen, and what this plant looked like before — so they are three panes.
 */
const pane = ref<Pane>('tasks')

const panes = computed(() => {
  const options: { value: Pane; label: string }[] = [
    { value: 'tasks', label: t('plants.tasks') },
    { value: 'schedules', label: t('plants.schedules') },
  ]
  // Nothing to show until the plant has been photographed at least once.
  if (images.value.length > 0) options.push({ value: 'photos', label: t('plants.imageHistory') })
  return options
})

onMounted(async () => {
  try {
    const [plantData, imageData, taskData] = await Promise.all([
      plantsApi.get(plantId),
      plantsApi.getImages(plantId),
      tasksApi.getForPlant(plantId, { limit: 20 }),
    ])
    plant.value = plantData
    images.value = imageData
    tasks.value = taskData
  } catch (e: unknown) {
    error.value = apiErrorMessage(e, 'errors.plants.loadFailed')
  } finally {
    loading.value = false
  }
})

async function refreshTasks() {
  tasks.value = await tasksApi.getForPlant(plantId, { limit: 20 })
}

async function handleDelete() {
  try {
    await plantsApi.delete(plantId)
    router.push('/garden')
  } catch (e: unknown) {
    error.value = apiErrorMessage(e, 'errors.plants.deleteFailed')
    showDeleteConfirm.value = false
  }
}
</script>

<template>
  <div>
    <button
      class="mb-4 inline-flex items-center gap-1 text-sm font-medium text-ink-faint transition-colors hover:text-ink"
      @click="router.push('/garden')"
    >
      <AppIcon name="chevron-left" :size="16" />
      {{ $t('plants.backToGarden') }}
    </button>

    <LoadingPlaceholder v-if="loading" :count="3" />

    <p
      v-else-if="error"
      class="flex items-center gap-2 rounded-md bg-overdue-soft px-3 py-2.5 text-sm text-overdue-ink"
    >
      <AppIcon name="alert" :size="16" class="shrink-0" />
      {{ error }}
    </p>

    <div v-else-if="plant" class="flex flex-col gap-6">
      <!--
        The photograph is the plant's identity, so it runs full width with the
        name set into it. The scrim is the one gradient in the app: white type
        needs a floor under it, and a solid bar would cover the picture.
        With no photo there is nothing to sit on, so the name sits below.
      -->
      <div class="relative overflow-hidden rounded-lg border border-line bg-surface-sunk">
        <div class="aspect-[16/9] w-full">
          <AuthedImage
            v-if="plant.currentImage"
            :src="`/api/images/${plant.currentImage.id}`"
            :alt="plant.name"
            class="h-full w-full object-cover"
          />
          <div v-else class="flex h-full w-full items-center justify-center text-primary-500">
            <AppIcon name="sprig" :size="88" :stroke-width="1" />
          </div>
        </div>
        <div
          v-if="plant.currentImage"
          class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/75 to-transparent px-4 pb-3 pt-10"
        >
          <h1 class="font-display text-2xl font-semibold text-ground drop-shadow-sm">
            {{ plant.name }}
          </h1>
          <p v-if="plant.location" class="flex items-center gap-1 text-sm text-ground/80">
            <AppIcon name="pin" :size="14" />{{ plant.location }}
          </p>
        </div>
      </div>

      <div class="flex flex-wrap items-start justify-between gap-3">
        <div v-if="!plant.currentImage">
          <h1 class="font-display text-2xl font-semibold text-ink">{{ plant.name }}</h1>
          <p v-if="plant.location" class="flex items-center gap-1 text-sm text-ink-faint">
            <AppIcon name="pin" :size="14" />{{ plant.location }}
          </p>
        </div>
        <!-- Edit and share are safe and frequent, so they stay up here.
             Deleting a plant is neither, and lives at the foot of the page. -->
        <div class="ml-auto flex gap-2">
          <RouterLink
            :to="`/plants/${plant.id}/edit`"
            class="btn btn-quiet"
            :title="$t('common.edit')"
          >
            <AppIcon name="pencil" :size="16" />
            <span class="sr-only sm:not-sr-only">{{ $t('common.edit') }}</span>
          </RouterLink>
          <button class="btn btn-quiet" :title="$t('plants.share')" @click="showShareDialog = true">
            <AppIcon name="share" :size="16" />
            <span class="sr-only sm:not-sr-only">{{ $t('plants.share') }}</span>
          </button>
        </div>
      </div>

      <div v-if="plant.instructions" class="card p-4">
        <h2 class="section-label mb-2">{{ $t('plants.careInstructions') }}</h2>
        <p class="whitespace-pre-line text-sm text-ink-muted">{{ plant.instructions }}</p>
      </div>

      <div class="flex flex-col gap-4">
        <SegmentedControl v-model="pane" :options="panes" class="self-start" />

        <TaskList v-if="pane === 'tasks'" :tasks="tasks" @task-updated="refreshTasks" />

        <ScheduleEditor v-else-if="pane === 'schedules'" :plant-id="plantId" />

        <div v-else class="flex flex-col gap-3">
          <div class="grid grid-cols-4 gap-2 sm:grid-cols-6">
            <button
              v-for="img in images"
              :key="img.id"
              class="overflow-hidden rounded-sm ring-2 transition-all"
              :class="
                selectedImageUrl === `/api/images/${img.id}`
                  ? 'ring-primary-500'
                  : 'ring-transparent hover:ring-line-strong'
              "
              @click="
                selectedImageUrl =
                  selectedImageUrl === `/api/images/${img.id}` ? null : `/api/images/${img.id}`
              "
            >
              <div class="aspect-square bg-surface-sunk">
                <AuthedImage
                  :src="`/api/images/${img.id}`"
                  :alt="$t('plants.photoAlt', { name: plant.name })"
                  class="h-full w-full object-cover"
                />
              </div>
            </button>
          </div>

          <div v-if="selectedImageUrl" class="overflow-hidden rounded-lg border border-line">
            <AuthedImage
              :src="selectedImageUrl"
              :alt="plant.name"
              class="w-full object-contain"
            />
          </div>
        </div>
      </div>

      <!-- Separated by a rule and put last: an irreversible action should take
           a deliberate scroll to reach, not sit a thumb's width from Edit. -->
      <div class="mt-2 border-t border-line pt-4">
        <button class="btn btn-danger" @click="showDeleteConfirm = true">
          <AppIcon name="trash" :size="16" />
          {{ $t('plants.deleteTitle') }}
        </button>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="showDeleteConfirm" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-ink/40" @click="showDeleteConfirm = false" />
        <div class="relative w-full max-w-sm rounded-lg border border-line bg-surface p-6 shadow-lift">
          <h2 class="font-display text-lg font-semibold text-ink">{{ $t('plants.deleteTitle') }}</h2>
          <!-- i18n-t, not string concatenation: the plant name sits in a
               different position in each language, so the slot has to travel
               with the sentence rather than be spliced around it. -->
          <i18n-t keypath="plants.deleteConfirm" tag="p" class="mt-2 text-sm text-ink-muted">
            <template #name><strong class="text-ink">{{ plant?.name }}</strong></template>
          </i18n-t>
          <div class="mt-5 flex justify-end gap-2">
            <button class="btn btn-quiet" @click="showDeleteConfirm = false">
              {{ $t('common.cancel') }}
            </button>
            <button
              class="btn border-transparent bg-overdue text-surface hover:bg-overdue-ink"
              @click="handleDelete"
            >
              {{ $t('common.delete') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <ShareDialog
      v-if="plant"
      :plant-id="plant.id"
      :visible="showShareDialog"
      @close="showShareDialog = false"
    />
  </div>
</template>
