<script setup lang="ts">
import type { Task } from '../types'
import type { AgendaSection } from '../utils/agenda'
import { useTaskLabels } from '../composables/useTaskLabels'
import EmptyState from './EmptyState.vue'
import TaskRow from './TaskRow.vue'

defineProps<{
  sections: AgendaSection[]
}>()

defineEmits<{
  'task-updated': [task: Task]
}>()

const { dayHeading } = useTaskLabels()

/** Only the overdue section is coloured. If everything is tinted, nothing is. */
function sectionAccent(id: AgendaSection['id']): string {
  if (id === 'overdue') return 'text-overdue-ink'
  if (id === 'completed') return 'text-ink-faint'
  return 'text-ink'
}
</script>

<template>
  <div class="flex flex-col gap-8">
    <section v-for="section in sections" :key="section.id" class="flex flex-col gap-3">
      <!-- The rule runs the full width and the label sits on it: the sections
           are a stack of days, and this is the join between them. -->
      <h2 class="flex items-center gap-3 border-b border-line pb-2">
        <span class="section-label" :class="sectionAccent(section.id)">
          {{ $t(`agenda.${section.id}`) }}
        </span>
      </h2>

      <EmptyState v-if="section.days.length === 0" :title="$t('tasks.nothingScheduled')" />

      <div v-else class="flex flex-col gap-5">
        <div v-for="day in section.days" :key="day.key" class="flex flex-col gap-2">
          <h3 class="text-xs font-semibold text-ink-muted">{{ dayHeading(day.label) }}</h3>
          <TaskRow
            v-for="task in day.tasks"
            :key="task.id"
            :task="task"
            @task-updated="$emit('task-updated', $event)"
          />
        </div>
      </div>
    </section>
  </div>
</template>
