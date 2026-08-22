<script setup lang="ts">
import { computed } from 'vue'
import type { Task, TaskWithPlant } from '../types'
import { taskTypeIcon } from '../utils/date'
import { statusTone, TONE_BADGE } from '../utils/tone'
import { useTaskLabels } from '../composables/useTaskLabels'
import TaskActions from './TaskActions.vue'
import AppIcon from './AppIcon.vue'
import AuthedImage from './AuthedImage.vue'

const props = defineProps<{
  task: TaskWithPlant
}>()

defineEmits<{
  'task-updated': [task: Task]
}>()

const { relativeDate, taskType, taskStatus, dueTime } = useTaskLabels()

/**
 * One decision, one place. `statusTone` in `utils/tone.ts` answers "how urgent
 * is this?" and this component only paints the answer — which is what lets the
 * calendar and the plant page agree with the agenda without repeating the
 * if-chain each of them used to carry.
 */
const tone = computed(() => statusTone(props.task))

/** Done and skipped tasks are struck through and dimmed. Must stay reactive:
 *  the row is keyed by task id, so completing one updates the prop in place
 *  rather than remounting the component. */
const settled = computed(
  () => props.task.status === 'done' || props.task.status === 'skipped',
)
</script>

<template>
  <div class="card p-3" :class="settled ? 'opacity-70' : ''">
    <div class="flex items-start justify-between gap-3">
      <div class="flex min-w-0 items-center gap-2.5">
        <!--
          The plant's photo, with the task-type icon badged onto it: at this
          size the picture says *which plant* faster than the name does, while
          the icon still says *what to do*. Plants with no photo fall back to
          the same sprig PlantCard uses, so the row never changes height.
        -->
        <!--
          Hidden from assistive tech, and skipped by the tab order: the plant's
          name is a second link to the same page immediately below, so exposing
          this one would announce every row's destination twice — once with no
          name at all when the plant has no photo to take an `alt` from.
        -->
        <RouterLink
          :to="`/plants/${task.plant.id}`"
          class="relative block size-11 shrink-0 overflow-hidden rounded-md bg-surface-sunk"
          aria-hidden="true"
          tabindex="-1"
        >
          <AuthedImage
            v-if="task.plant.currentImage"
            :src="`/api/images/${task.plant.currentImage.id}`"
            :alt="task.plant.name"
            class="h-full w-full object-cover"
          />
          <span v-else class="flex h-full w-full items-center justify-center text-primary-500">
            <AppIcon name="sprig" :size="22" />
          </span>
          <span
            class="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full border border-line bg-surface text-ink-muted"
          >
            <AppIcon :name="taskTypeIcon(task.taskType)" :size="13" />
          </span>
        </RouterLink>
        <div class="min-w-0">
          <p
            class="truncate text-sm font-semibold text-ink"
            :class="settled ? 'line-through' : ''"
          >
            {{ taskType(task.taskType) }}
          </p>
          <RouterLink
            :to="`/plants/${task.plant.id}`"
            class="block truncate text-xs text-primary-700 hover:underline"
          >
            {{ task.plant.name }}<span v-if="task.plant.location" class="text-ink-faint">
              &middot; {{ task.plant.location }}</span>
          </RouterLink>
          <p class="text-xs text-ink-faint">
            {{ dueTime(task.dueAt) }} &middot; {{ relativeDate(task.dueAt) }}
          </p>
        </div>
      </div>
      <span class="badge shrink-0" :class="TONE_BADGE[tone]">
        {{ taskStatus(task) }}
      </span>
    </div>
    <div v-if="task.status !== 'skipped'" class="mt-2.5">
      <TaskActions :task="task" @task-updated="$emit('task-updated', $event)" />
    </div>
  </div>
</template>
