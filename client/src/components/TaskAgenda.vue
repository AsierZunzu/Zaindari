<script setup lang="ts">
import type { Task } from '../types'
import type { AgendaSection } from '../utils/agenda'
import TaskRow from './TaskRow.vue'

defineProps<{
  sections: AgendaSection[]
}>()

defineEmits<{
  'task-updated': [task: Task]
}>()

function sectionAccent(id: AgendaSection['id']): string {
  if (id === 'overdue') return 'text-red-700'
  if (id === 'completed') return 'text-gray-500'
  return 'text-gray-900'
}
</script>

<template>
  <div class="space-y-6">
    <section v-for="section in sections" :key="section.id">
      <h2 class="text-sm font-bold uppercase tracking-wide" :class="sectionAccent(section.id)">
        {{ section.title }}
      </h2>

      <div v-if="section.days.length === 0" class="mt-2 rounded-lg border-2 border-dashed border-gray-200 p-6 text-center">
        <p class="text-sm text-gray-500">Nothing scheduled. Your plants are all set.</p>
      </div>

      <div v-else class="mt-2 space-y-4">
        <div v-for="day in section.days" :key="day.key">
          <h3 class="mb-2 text-xs font-semibold text-gray-500">{{ day.label }}</h3>
          <div class="space-y-2">
            <TaskRow
              v-for="task in day.tasks"
              :key="task.id"
              :task="task"
              @task-updated="$emit('task-updated', $event)"
            />
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
