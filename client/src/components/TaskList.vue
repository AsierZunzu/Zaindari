<script setup lang="ts">
import { computed } from 'vue'
import type { Task } from '../types'
import { taskTypeIcon } from '../utils/date'
import { statusTone, TONE_BADGE } from '../utils/tone'
import { useTaskLabels } from '../composables/useTaskLabels'
import AppIcon from './AppIcon.vue'
import EmptyState from './EmptyState.vue'
import TaskActions from './TaskActions.vue'

const props = defineProps<{
  tasks: Task[]
}>()

const emit = defineEmits<{
  'task-updated': [task: Task]
}>()

const { relativeDate, taskType, taskStatus } = useTaskLabels()

/**
 * One plant's tasks, grouped. This was three copies of the same markup that
 * had drifted apart — different opacities, one of them hardcoding its badge
 * text instead of asking `taskStatus`. The differences that are real are the
 * three flags below.
 */
const groups = computed(() => [
  {
    id: 'pending',
    title: 'tasks.pending',
    tasks: props.tasks.filter((t) => t.status === 'pending' || t.status === 'snoozed'),
    dim: false,
    actions: true,
    showDue: true,
  },
  {
    id: 'done',
    title: 'tasks.recentlyCompleted',
    tasks: props.tasks.filter((t) => t.status === 'done'),
    dim: true,
    actions: true,
    showDue: true,
  },
  {
    id: 'skipped',
    title: 'tasks.skippedHeading',
    // Skipped tasks are history: no date worth reading, and nothing to undo.
    tasks: props.tasks.filter((t) => t.status === 'skipped'),
    dim: true,
    actions: false,
    showDue: false,
  },
])

const isEmpty = computed(() => props.tasks.length === 0)
</script>

<template>
  <div class="flex flex-col gap-5">
    <EmptyState v-if="isEmpty" :title="$t('tasks.none')" />

    <div
      v-for="group in groups.filter((g) => g.tasks.length > 0)"
      :key="group.id"
      class="flex flex-col gap-2"
    >
      <h3 class="section-label">{{ $t(group.title) }}</h3>

      <div
        v-for="task in group.tasks"
        :key="task.id"
        class="card p-3"
        :class="group.dim ? 'opacity-75' : ''"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex min-w-0 items-center gap-2.5">
            <span
              class="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-sunk text-ink-muted"
            >
              <AppIcon :name="taskTypeIcon(task.taskType)" :size="18" />
            </span>
            <div class="min-w-0">
              <p
                class="truncate text-sm font-semibold text-ink"
                :class="group.dim ? 'line-through' : ''"
              >
                {{ taskType(task.taskType) }}
              </p>
              <p v-if="group.showDue" class="text-xs text-ink-faint">
                {{ relativeDate(task.dueAt) }}
              </p>
            </div>
          </div>
          <span class="badge shrink-0" :class="TONE_BADGE[statusTone(task)]">
            {{ taskStatus(task) }}
          </span>
        </div>
        <div v-if="group.actions" class="mt-2.5">
          <TaskActions :task="task" @task-updated="emit('task-updated', $event)" />
        </div>
      </div>
    </div>
  </div>
</template>
