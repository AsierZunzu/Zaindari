import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TaskCalendar from '../TaskCalendar.vue'
import type { TaskWithPlant } from '../../types'
import { createTestI18n } from '../../test/i18n'

const MONTH = new Date('2026-07-01T00:00:00')

function task(overrides: Partial<TaskWithPlant> & { id: string; dueAt: string }): TaskWithPlant {
  return {
    plantId: 'plant-1',
    taskType: 'watering',
    status: 'pending',
    completedAt: null,
    completedBy: null,
    snoozeUntil: null,
    plant: { id: 'plant-1', name: 'Monstera', location: 'Kitchen', currentImage: null },
    ...overrides,
  }
}

const TASKS = [
  task({ id: 'a', dueAt: '2026-07-23T08:00:00' }),
  task({
    id: 'b',
    dueAt: '2026-07-23T09:00:00',
    plantId: 'plant-2',
    plant: { id: 'plant-2', name: 'Ficus', location: null, currentImage: null },
  }),
  task({ id: 'c', dueAt: '2026-07-23T10:00:00', taskType: 'misting' }),
]

function mountCalendar(tasks: TaskWithPlant[] = TASKS) {
  return mount(TaskCalendar, {
    props: { month: MONTH, tasks },
    global: {
      plugins: [createTestI18n()],
      // TaskRow only matters for the day list below the grid, and it wants a router.
      stubs: { TaskRow: true },
    },
  })
}

/** The wrapper `<div>` around the day button for the given day of the month. */
function dayCell(wrapper: ReturnType<typeof mountCalendar>, dayOfMonth: number) {
  return wrapper
    .findAll('.grid > div.relative')
    .find((cell) => cell.find('button').text().startsWith(String(dayOfMonth)))!
}

describe('TaskCalendar markers', () => {
  it('names the plants behind the hovered marker, and only that one', async () => {
    const cell = dayCell(mountCalendar(), 23)
    const markers = cell.findAll('.cursor-help')

    // Nothing is shown until the pointer is actually over a marker.
    expect(cell.find('[role="tooltip"]').exists()).toBe(false)

    await markers[0].trigger('mouseenter')
    const tooltip = cell.find('[role="tooltip"]')
    expect(tooltip.text()).toContain('Watering')
    expect(tooltip.text()).toContain('Monstera and Ficus')
    expect(tooltip.text()).not.toContain('Misting')

    await markers[1].trigger('mouseenter')
    expect(cell.find('[role="tooltip"]').text()).toContain('Misting')
  })

  it('hides the tooltip when the pointer leaves', async () => {
    const cell = dayCell(mountCalendar(), 23)

    await cell.findAll('.cursor-help')[0].trigger('mouseenter')
    expect(cell.find('[role="tooltip"]').exists()).toBe(true)

    await cell.findAll('.cursor-help')[0].trigger('mouseleave')
    expect(cell.find('[role="tooltip"]').exists()).toBe(false)
  })

  it('opens a popover on tap, where a hover tooltip never fires', async () => {
    const wrapper = mountCalendar()
    const cell = dayCell(wrapper, 23)

    await cell.find('button').trigger('pointerdown', { pointerType: 'touch' })
    await cell.find('button').trigger('click', { detail: 1 })

    // A tap can't say which marker it meant, so it lists the whole day.
    const popover = cell.find('[role="tooltip"]')
    expect(popover.exists()).toBe(true)
    expect(popover.text()).toContain('Monstera and Ficus')
    expect(popover.text()).toContain('Misting')
  })

  it('leaves the popover shut for a mouse click, which already gets the tooltip', async () => {
    const wrapper = mountCalendar()
    const cell = dayCell(wrapper, 23)

    await cell.find('button').trigger('pointerdown', { pointerType: 'mouse' })
    await cell.find('button').trigger('click', { detail: 1 })

    expect(cell.find('[role="tooltip"]').exists()).toBe(false)
    // The day is still selected — the popover is the only thing that changed.
    expect(cell.find('button').classes()).toContain('ring-primary-500')
  })

  it('opens for a keyboard activation, which has no pointer at all', async () => {
    const wrapper = mountCalendar()
    const cell = dayCell(wrapper, 23)

    await cell.find('button').trigger('click', { detail: 0 })

    expect(cell.find('[role="tooltip"]').exists()).toBe(true)
  })

  it('dismisses on a second tap and on Escape', async () => {
    const wrapper = mountCalendar()
    const cell = dayCell(wrapper, 23)
    const open = async () => {
      await cell.find('button').trigger('pointerdown', { pointerType: 'touch' })
      await cell.find('button').trigger('click', { detail: 1 })
    }

    await open()
    await open()
    expect(cell.find('[role="tooltip"]').exists()).toBe(false)

    await open()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(cell.find('[role="tooltip"]').exists()).toBe(false)
  })

  it('stays shut on a day with nothing due', async () => {
    const wrapper = mountCalendar()
    const cell = dayCell(wrapper, 24)

    await cell.find('button').trigger('pointerdown', { pointerType: 'touch' })
    await cell.find('button').trigger('click', { detail: 1 })

    expect(cell.find('[role="tooltip"]').exists()).toBe(false)
  })
})
