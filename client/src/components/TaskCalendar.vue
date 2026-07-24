<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Task, TaskType, TaskWithPlant } from '../types'
import { taskTypeEmoji } from '../utils/date'
import {
  buildMonthGrid,
  dayKey,
  dayLabel,
  dayMarkers,
  isActive,
  sameDay,
  startOfDay,
  type CalendarCell,
  type DayMarker,
} from '../utils/agenda'
import { useTaskLabels } from '../composables/useTaskLabels'
import TaskRow from './TaskRow.vue'

const props = defineProps<{
  month: Date
  tasks: TaskWithPlant[]
}>()

const emit = defineEmits<{
  'update:month': [month: Date]
  'task-updated': [task: Task]
}>()

const { dayHeading, markerPlants, monthHeading, taskType, weekdayNames } = useTaskLabels()

// Derived from the locale rather than hardcoded. The grid stays Monday-first
// (correct for en/es/eu); only the names change.
const weekdays = computed(() => weekdayNames())
const selectedKey = ref(dayKey(new Date()))

const weeks = computed(() => buildMonthGrid(props.month, props.tasks))
const cells = computed(() => weeks.value.flat())

const selectedCell = computed<CalendarCell | undefined>(() =>
  cells.value.find((cell) => cell.key === selectedKey.value),
)

/** The day whose marker popover is open, if any. */
const openKey = ref<string | null>(null)
/** The marker under the pointer. Set on `mouseenter`, so it shows with no delay. */
const hovered = ref<{ key: string; taskType: TaskType } | null>(null)
const gridRef = ref<HTMLElement | null>(null)
/**
 * `pointerdown` fires before `click` and is the only place the input device is
 * still known — by click time a tap and a mouse press look identical.
 */
const lastPointerType = ref('mouse')

// Paging to another month leaves the previously selected day off the grid, so
// land the selection on that month's first day instead of showing nothing.
watch(
  () => props.month,
  (month) => {
    openKey.value = null
    const today = new Date()
    const onScreen = cells.value.some((c) => c.key === selectedKey.value && c.inMonth)
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

function rememberPointer(event: PointerEvent) {
  lastPointerType.value = event.pointerType || 'mouse'
}

/**
 * Selecting a day also reveals its plants — but only for the people who cannot
 * hover. `title` never fires on touch and a keyboard user has no pointer at
 * all; a mouse click already had its tooltip, so popping one open there would
 * just be noise. Tapping the same day again dismisses it.
 */
function selectDay(cell: CalendarCell, event: MouseEvent) {
  selectedKey.value = cell.key
  // A keyboard activation arrives as a click with no clicks behind it.
  const hoverless = lastPointerType.value === 'touch' || event.detail === 0
  const reopening = openKey.value !== cell.key
  openKey.value = hoverless && reopening && dayMarkers(cell).length > 0 ? cell.key : null
}

/**
 * What the tooltip should say for a cell, or nothing at all.
 *
 * Hovering is the precise gesture — it names the one marker under the pointer.
 * The tap/keyboard popover can't be precise (the emoji are far too small to be
 * their own targets), so it lists the whole day instead.
 */
function tooltipMarkers(cell: CalendarCell): DayMarker[] {
  const markers = dayMarkers(cell)
  if (hovered.value?.key === cell.key) {
    return markers.filter((m) => m.taskType === hovered.value!.taskType)
  }
  return openKey.value === cell.key ? markers : []
}

/** Edge columns would push a centred popover off the screen. */
function popoverAlign(index: number): string {
  const column = index % 7
  if (column === 0) return 'left-0'
  if (column === 6) return 'right-0'
  return 'left-1/2 -translate-x-1/2'
}

/** The little notch has to sit over the cell it belongs to, not the tooltip's centre. */
function arrowAlign(index: number): string {
  const column = index % 7
  if (column === 0) return 'left-4'
  if (column === 6) return 'right-4'
  return 'left-1/2 -ml-1'
}

function onDocumentClick(event: MouseEvent) {
  if (!openKey.value) return
  // Clicks inside the grid are the grid's own business — `selectDay` decides.
  if (gridRef.value?.contains(event.target as Node)) return
  openKey.value = null
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') openKey.value = null
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
})

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
        :aria-label="$t('tasks.previousMonth')"
        @click="shiftMonth(-1)"
      >
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <div class="flex items-center gap-2">
        <h2 class="text-sm font-semibold text-gray-900">{{ monthHeading(month) }}</h2>
        <button
          class="rounded-md px-2 py-1 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-50"
          @click="goToToday"
        >
          {{ $t('common.today') }}
        </button>
      </div>
      <button
        class="rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100"
        :aria-label="$t('tasks.nextMonth')"
        @click="shiftMonth(1)"
      >
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>

    <!-- Month grid. No `overflow-hidden`: it would clip the marker popover. -->
    <div class="mt-3 rounded-xl bg-white p-2 shadow-sm ring-1 ring-gray-100">
      <div ref="gridRef" class="grid grid-cols-7 gap-1">
        <div
          v-for="weekday in weekdays"
          :key="weekday"
          class="pb-1 text-center text-xs font-semibold text-gray-400"
        >
          {{ weekday.charAt(0) }}<span class="hidden sm:inline">{{ weekday.slice(1) }}</span>
        </div>

        <div v-for="(cell, index) in cells" :key="cell.key" class="relative">
          <button
            class="flex aspect-square w-full flex-col items-center justify-start rounded-lg p-1 transition-colors hover:bg-gray-100"
            :class="cellClass(cell)"
            :aria-expanded="dayMarkers(cell).length > 0 ? openKey === cell.key : undefined"
            @pointerdown="rememberPointer"
            @click="selectDay(cell, $event)"
          >
            <span class="text-xs font-medium" :class="cell.isToday ? 'font-bold text-primary-700' : ''">
              {{ cell.date.getDate() }}
            </span>
            <span class="mt-0.5 flex flex-wrap justify-center gap-px overflow-hidden text-[9px] leading-none sm:text-xs">
              <span
                v-for="marker in dayMarkers(cell)"
                :key="marker.taskType"
                class="cursor-help"
                @mouseenter="hovered = { key: cell.key, taskType: marker.taskType }"
                @mouseleave="hovered = null"
                >{{ taskTypeEmoji(marker.taskType) }}</span
              >
            </span>
          </button>

          <!--
            Hand-rolled rather than a `title`: the native tooltip waits about a
            second, renders in the browser's own chrome, and cannot be styled.
            `pointer-events-none` keeps it from stealing the hover that spawned it.
          -->
          <div
            v-if="tooltipMarkers(cell).length > 0"
            role="tooltip"
            class="pointer-events-none absolute top-full z-20 mt-1.5 w-max max-w-[12rem] rounded-lg bg-white px-2.5 py-1.5 text-left shadow-lg ring-1 ring-black/5"
            :class="popoverAlign(index)"
          >
            <span
              class="absolute -top-1 h-2 w-2 rotate-45 border-l border-t border-black/5 bg-white"
              :class="arrowAlign(index)"
            />
            <div class="relative space-y-1">
              <div v-for="marker in tooltipMarkers(cell)" :key="marker.taskType">
                <p class="text-[11px] font-semibold leading-tight text-gray-900">
                  {{ taskTypeEmoji(marker.taskType) }} {{ taskType(marker.taskType) }}
                </p>
                <p class="text-[11px] leading-tight text-gray-500">{{ markerPlants(marker) }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Selected day -->
    <div v-if="selectedCell" class="mt-4">
      <h3 class="mb-2 text-xs font-semibold text-gray-500">
        {{ dayHeading(dayLabel(selectedCell.date)) }}
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
        <p class="text-sm text-gray-500">{{ $t('tasks.nothingDueOnDay') }}</p>
      </div>
    </div>
  </div>
</template>
