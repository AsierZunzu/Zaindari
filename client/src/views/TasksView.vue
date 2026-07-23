<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth'
import { useTasksStore } from '../stores/tasks'
import type { Task } from '../types'
import { isActive } from '../utils/agenda'
import TaskAgenda from '../components/TaskAgenda.vue'
import TaskCalendar from '../components/TaskCalendar.vue'

type ViewMode = 'agenda' | 'calendar'

const VIEW_MODE_KEY = 'tasksViewMode'

const auth = useAuthStore()
const tasksStore = useTasksStore()
const { t } = useI18n()

// Agenda is the default the app opens on; the choice sticks so someone who
// thinks in months is not dropped back into a list on every visit.
const mode = ref<ViewMode>(
  localStorage.getItem(VIEW_MODE_KEY) === 'calendar' ? 'calendar' : 'agenda',
)
const month = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1))

const outstanding = computed(
  () => tasksStore.tasks.filter((t) => isActive(t) && new Date(t.dueAt) <= new Date()).length,
)

function refresh() {
  return mode.value === 'agenda'
    ? tasksStore.fetchAgenda()
    : tasksStore.fetchMonth(month.value)
}

// The two views need different slices of the feed, so switching refetches
// rather than showing whichever window happened to be loaded last.
watch(mode, (value) => {
  localStorage.setItem(VIEW_MODE_KEY, value)
  refresh()
})

watch(month, () => {
  if (mode.value === 'calendar') tasksStore.fetchMonth(month.value)
})

function onTaskUpdated(task: Task) {
  // Completing or skipping schedules the next occurrence server-side, so the
  // feed has to come back from the server to show it.
  tasksStore.applyUpdate(task)
  refresh()
}

onMounted(refresh)
</script>

<template>
  <div>
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">{{ $t('tasks.title') }}</h1>
        <!-- One whole sentence per branch, not "task" + a conditional "s":
             Spanish and Basque inflect the verb differently from English, so
             the fragments cannot be reassembled per locale. -->
        <p class="mt-1 text-sm text-gray-500">
          {{
            outstanding > 0
              ? t('tasks.outstanding', { count: outstanding, name: auth.user?.displayName }, outstanding)
              : t('tasks.allClear', { name: auth.user?.displayName })
          }}
        </p>
      </div>

      <!-- Agenda / calendar switch -->
      <div class="inline-flex rounded-lg bg-gray-100 p-0.5" role="group">
        <button
          class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
          :class="mode === 'agenda' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'"
          :aria-pressed="mode === 'agenda'"
          @click="mode = 'agenda'"
        >
          {{ $t('tasks.agenda') }}
        </button>
        <button
          class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
          :class="mode === 'calendar' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'"
          :aria-pressed="mode === 'calendar'"
          @click="mode = 'calendar'"
        >
          {{ $t('tasks.calendar') }}
        </button>
      </div>
    </div>

    <p v-if="tasksStore.error" class="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
      {{ tasksStore.error }}
    </p>

    <div v-if="tasksStore.loading && tasksStore.tasks.length === 0" class="mt-12 flex justify-center">
      <div class="h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
    </div>

    <div v-else class="mt-6">
      <TaskAgenda
        v-if="mode === 'agenda'"
        :sections="tasksStore.agenda"
        @task-updated="onTaskUpdated"
      />
      <TaskCalendar
        v-else
        v-model:month="month"
        :tasks="tasksStore.tasks"
        @task-updated="onTaskUpdated"
      />
    </div>
  </div>
</template>
