<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Task, TaskWithPlant } from '../types'
import { taskTypeEmoji } from '../utils/date'
import {
  buildMonthGrid,
  dayKey,
  dayLabel,
  isActive,
  monthLabel,
  sameDay,
  startOfDay,
  type CalendarCell,
} from '../utils/agenda'
import TaskRow from './TaskRow.vue'

const props = defineProps<{
  month: Date
  tasks: TaskWithPlant[]
}>()

const emit = defineEmits<{
  'update:month': [month: Date]
  'task-updated': [task: Task]
}>()

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const selectedKey = ref(dayKey(new Date()))

const weeks = computed(() => buildMonthGrid(props.month, props.tasks))

const selectedCell = computed<CalendarCell | undefined>(() =>
  weeks.value.flat().find((cell) => cell.key === selectedKey.value),
)

// Paging to another month leaves the previously selected day off the grid, so
// land the selection on that month's first day instead of showing nothing.
watch(
  () => props.month,
  (month) => {
    const today = new Date()
    const onScreen = weeks.value.flat().some((c) => c.key === selectedKey.value && c.inMonth)
    if (onScreen) return
    selectedKey.value = dayKey(
      month.getMonth() === today.getMonth() && month.getFullYear() === today.getFullYear()
        ? today
        : new Date(month.getFullYear(), month.getMonth(), 1),
    )
  },
)

function shiftMonth(delta: number) {
  emit('update:month', new Date(props.month.getFullYear(), props.month.getMonth() + delta, 1))
}

function goToToday() {
  const today = new Date()
  selectedKey.value = dayKey(today)
  if (!sameDay(startOfDay(props.month), startOfDay(new Date(today.getFullYear(), today.getMonth(), 1)))) {
    emit('update:month', new Date(today.getFullYear(), today.getMonth(), 1))
  }
}

/** Distinct task types on a day — four dots beats twelve identical droplets. */
function markers(cell: CalendarCell): string[] {
  const types = new Set(cell.tasks.filter(isActive).map((t) => t.taskType))
  return [...types].map(taskTypeEmoji)
}

function hasOverdue(cell: CalendarCell): boolean {
  const today = startOfDay(new Date())
  return cell.date.getTime() < today.getTime() && cell.tasks.some(isActive)
}

function cellClass(cell: CalendarCell): string {
  const classes: string[] = []
  if (!cell.inMonth) classes.push('text-gray-300')
  else classes.push('text-gray-700')
  if (cell.key === selectedKey.value) classes.push('ring-2 ring-primary-500')
  else if (cell.isToday) classes.push('ring-1 ring-primary-300')
  if (hasOverdue(cell)) classes.push('bg-red-50')
  else if (cell.isToday) classes.push('bg-primary-50')
  return classes.join(' ')
}
</script>

<template>
  <div>
    <!-- Month navigation -->
    <div class="flex items-center justify-between">
      <button
        class="rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100"
        aria-label="Previous month"
        @click="shiftMonth(-1)"
      >
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <div class="flex items-center gap-2">
        <h2 class="text-sm font-semibold text-gray-900">{{ monthLabel(month) }}</h2>
        <button
          class="rounded-md px-2 py-1 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-50"
          @click="goToToday"
        >
          Today
        </button>
      </div>
      <button
        class="rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100"
        aria-label="Next month"
        @click="shiftMonth(1)"
      >
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>

    <!-- Month grid -->
    <div class="mt-3 overflow-hidden rounded-xl bg-white p-2 shadow-sm ring-1 ring-gray-100">
      <div class="grid grid-cols-7 gap-1">
        <div
          v-for="weekday in weekdays"
          :key="weekday"
          class="pb-1 text-center text-xs font-semibold text-gray-400"
        >
          {{ weekday.charAt(0) }}<span class="hidden sm:inline">{{ weekday.slice(1) }}</span>
        </div>

        <button
          v-for="cell in weeks.flat()"
          :key="cell.key"
          class="flex aspect-square flex-col items-center justify-start rounded-lg p-1 transition-colors hover:bg-gray-100"
          :class="cellClass(cell)"
          @click="selectedKey = cell.key"
        >
          <span class="text-xs font-medium" :class="cell.isToday ? 'font-bold text-primary-700' : ''">
            {{ cell.date.getDate() }}
          </span>
          <span class="mt-0.5 flex flex-wrap justify-center gap-px overflow-hidden text-[9px] leading-none sm:text-xs">
            <span v-for="marker in markers(cell)" :key="marker">{{ marker }}</span>
          </span>
        </button>
      </div>
    </div>

    <!-- Selected day -->
    <div v-if="selectedCell" class="mt-4">
      <h3 class="mb-2 text-xs font-semibold text-gray-500">
        {{ dayLabel(selectedCell.date) }}
      </h3>
      <div v-if="selectedCell.tasks.length > 0" class="space-y-2">
        <TaskRow
          v-for="task in selectedCell.tasks"
          :key="task.id"
          :task="task"
          @task-updated="$emit('task-updated', $event)"
        />
      </div>
      <div v-else class="rounded-lg border-2 border-dashed border-gray-200 p-6 text-center">
        <p class="text-sm text-gray-500">Nothing due on this day.</p>
      </div>
    </div>
  </div>
</template>
