import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import type { TaskWithPlant } from '../../types'
import TasksView from '../TasksView.vue'
import { createTestI18n } from '../../test/i18n'

const list = vi.fn()

vi.mock('../../api/tasks', () => ({
  tasksApi: {
    list: (...args: unknown[]) => list(...args),
    complete: vi.fn(),
    undo: vi.fn(),
    snooze: vi.fn(),
    skip: vi.fn(),
  },
}))

const NOW = new Date('2026-07-23T10:00:00')

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

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/plants/:id', component: { template: '<div />' } },
  ],
})

function mountTasks() {
  return mount(TasksView, { global: { plugins: [router, createTestI18n()] } })
}

describe('TasksView', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    localStorage.clear()
    setActivePinia(createPinia())
    list.mockReset()
    list.mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens on the agenda', async () => {
    const wrapper = mountTasks()
    await flushPromises()

    expect(wrapper.find('h1').text()).toBe('Tasks')
    expect(wrapper.findComponent({ name: 'TaskAgenda' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'TaskCalendar' }).exists()).toBe(false)
  })

  it('asks the server for overdue tasks alongside the agenda window', async () => {
    mountTasks()
    await flushPromises()

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ includeOverdue: true, from: expect.any(Date), to: expect.any(Date) }),
    )
  })

  it('groups tasks into overdue and upcoming', async () => {
    list.mockResolvedValue([
      task({ id: 'late', dueAt: '2026-07-20T08:00:00' }),
      task({ id: 'soon', dueAt: '2026-07-25T08:00:00', taskType: 'misting' }),
    ])

    const wrapper = mountTasks()
    await flushPromises()

    expect(wrapper.text()).toContain('Overdue')
    expect(wrapper.text()).toContain('Upcoming')
    expect(wrapper.text()).toContain('Monstera')
  })

  it('counts only outstanding work in the summary line', async () => {
    list.mockResolvedValue([
      task({ id: 'late', dueAt: '2026-07-20T08:00:00' }),
      task({ id: 'future', dueAt: '2026-08-01T08:00:00' }),
      task({ id: 'done', dueAt: '2026-07-21T08:00:00', status: 'done' }),
    ])

    const wrapper = mountTasks()
    await flushPromises()

    expect(wrapper.text()).toContain('1 task needs your attention')
  })

  it('switches to the calendar and refetches just that month', async () => {
    const wrapper = mountTasks()
    await flushPromises()
    list.mockClear()

    await wrapper.findAll('button').find((b) => b.text() === 'Calendar')!.trigger('click')
    await flushPromises()

    expect(wrapper.findComponent({ name: 'TaskCalendar' }).exists()).toBe(true)
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ from: expect.any(Date), to: expect.any(Date) }),
    )
    expect(list.mock.calls[0][0].includeOverdue).toBeUndefined()
  })

  it('remembers the calendar choice for the next visit', async () => {
    const wrapper = mountTasks()
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text() === 'Calendar')!.trigger('click')
    await flushPromises()

    expect(localStorage.getItem('tasksViewMode')).toBe('calendar')

    const revisit = mountTasks()
    await flushPromises()
    expect(revisit.findComponent({ name: 'TaskCalendar' }).exists()).toBe(true)
  })

  it('refetches when the calendar pages to another month', async () => {
    localStorage.setItem('tasksViewMode', 'calendar')
    const wrapper = mountTasks()
    await flushPromises()
    list.mockClear()

    await wrapper.find('button[aria-label="Next month"]').trigger('click')
    await flushPromises()

    expect(list).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('August 2026')
  })
})
