<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Task, TaskType, TaskWithPlant } from '../types'
import { taskTypeIcon } from '../utils/date'
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
import AppIcon from './AppIcon.vue'
import EmptyState from './EmptyState.vue'
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
  // Days spilling in from the neighbouring month are still readable, just
  // clearly not part of what is being looked at.
  if (!cell.inMonth) classes.push('text-line-strong')
  else classes.push('text-ink-muted')
  if (cell.key === selectedKey.value) classes.push('ring-2 ring-primary-500')
  else if (cell.isToday) classes.push('ring-1 ring-primary-300')
  if (hasOverdue(cell)) classes.push('bg-overdue-soft')
  else if (cell.isToday) classes.push('bg-primary-50')
  return classes.join(' ')
}
</script>

<template>
  <div>
    <!-- Month navigation -->
    <div class="flex items-center justify-between">
      <button
        class="rounded-md p-2 text-ink-muted transition-colors hover:bg-surface-sunk"
        :aria-label="$t('tasks.previousMonth')"
        @click="shiftMonth(-1)"
      >
        <AppIcon name="chevron-left" :size="20" />
      </button>
      <div class="flex items-center gap-2">
        <h2 class="font-display text-base font-semibold text-ink">{{ monthHeading(month) }}</h2>
        <button
          class="rounded-sm px-2 py-1 text-xs font-semibold text-primary-700 transition-colors hover:bg-primary-50"
          @click="goToToday"
        >
          {{ $t('common.today') }}
        </button>
      </div>
      <button
        class="rounded-md p-2 text-ink-muted transition-colors hover:bg-surface-sunk"
        :aria-label="$t('tasks.nextMonth')"
        @click="shiftMonth(1)"
      >
        <AppIcon name="chevron-right" :size="20" />
      </button>
    </div>

    <!-- Month grid. No `overflow-hidden`: it would clip the marker popover. -->
    <div class="card mt-3 p-2">
      <div ref="gridRef" class="grid grid-cols-7 gap-1">
        <div
          v-for="weekday in weekdays"
          :key="weekday"
          class="pb-1 text-center text-xs font-semibold text-ink-faint"
        >
          {{ weekday.charAt(0) }}<span class="hidden sm:inline">{{ weekday.slice(1) }}</span>
        </div>

        <div v-for="(cell, index) in cells" :key="cell.key" class="relative">
          <button
            class="flex aspect-square w-full flex-col items-center justify-start rounded-md p-1 transition-colors hover:bg-surface-sunk"
            :class="cellClass(cell)"
            :aria-expanded="dayMarkers(cell).length > 0 ? openKey === cell.key : undefined"
            @pointerdown="rememberPointer"
            @click="selectDay(cell, $event)"
          >
            <span
              class="text-xs font-medium tabular-nums"
              :class="cell.isToday ? 'font-bold text-primary-700' : ''"
            >
              {{ cell.date.getDate() }}
            </span>
            <!-- Line icons rather than emoji: at 12px an emoji is a coloured
                 smudge that renders differently on every platform, while a
                 stroked glyph stays a glyph. -->
            <span
              class="mt-0.5 flex flex-wrap justify-center gap-0.5 overflow-hidden"
              :class="hasOverdue(cell) ? 'text-overdue' : 'text-ink-faint'"
            >
              <span
                v-for="marker in dayMarkers(cell)"
                :key="marker.taskType"
                class="cursor-help"
                @mouseenter="hovered = { key: cell.key, taskType: marker.taskType }"
                @mouseleave="hovered = null"
              >
                <AppIcon :name="taskTypeIcon(marker.taskType)" :size="12" />
              </span>
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
            class="pointer-events-none absolute top-full z-20 mt-1.5 w-max max-w-[12rem] rounded-md border border-line bg-surface px-2.5 py-1.5 text-left shadow-lift"
            :class="popoverAlign(index)"
          >
            <span
              class="absolute -top-1 h-2 w-2 rotate-45 border-l border-t border-line bg-surface"
              :class="arrowAlign(index)"
            />
            <div class="relative flex flex-col gap-1">
              <div v-for="marker in tooltipMarkers(cell)" :key="marker.taskType">
                <p class="flex items-center gap-1 text-[11px] font-semibold leading-tight text-ink">
                  <AppIcon :name="taskTypeIcon(marker.taskType)" :size="12" class="text-ink-muted" />
                  {{ taskType(marker.taskType) }}
                </p>
                <p class="text-[11px] leading-tight text-ink-faint">{{ markerPlants(marker) }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Selected day -->
    <div v-if="selectedCell" class="mt-5 flex flex-col gap-2">
      <h3 class="section-label">{{ dayHeading(dayLabel(selectedCell.date)) }}</h3>
      <TaskRow
        v-for="task in selectedCell.tasks"
        :key="task.id"
        :task="task"
        @task-updated="$emit('task-updated', $event)"
      />
      <EmptyState v-if="selectedCell.tasks.length === 0" :title="$t('tasks.nothingDueOnDay')" />
    </div>
  </div>
</template>
