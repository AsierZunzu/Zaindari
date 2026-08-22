import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import TaskRow from '../TaskRow.vue'
import AppIcon from '../AppIcon.vue'
import { api } from '../../api/client'
import type { TaskWithPlant } from '../../types'
import { createTestI18n } from '../../test/i18n'

vi.mock('../../api/client', () => ({
  api: { getBlob: vi.fn(), post: vi.fn() },
}))
const mockedApi = vi.mocked(api)

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/plants/:id', component: { template: '<div />' } },
  ],
})

/** Dates are relative to now: a fixture pinned to a literal date would change
 *  tone on its own as the calendar moved past it. */
function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
}

function makeTask(overrides: Partial<TaskWithPlant> = {}): TaskWithPlant {
  return {
    id: 't1',
    plantId: 'plant-1',
    taskType: 'watering',
    status: 'pending',
    dueAt: daysFromNow(3),
    completedAt: null,
    completedBy: null,
    snoozeUntil: null,
    plant: {
      id: 'plant-1',
      name: 'Monstera',
      location: 'Kitchen',
      currentImage: {
        id: 'img1',
        plantId: 'plant-1',
        filePath: '/uploads/img1.webp',
        isCurrent: true,
        createdAt: '2026-01-01T00:00:00Z',
      },
    },
    ...overrides,
  }
}

function mountRow(task: TaskWithPlant) {
  return mount(TaskRow, {
    props: { task },
    global: { plugins: [router, createTestI18n()] },
  })
}

describe('TaskRow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.getBlob.mockResolvedValue(new Blob(['bytes'], { type: 'image/webp' }))
    URL.createObjectURL = vi.fn().mockReturnValue('blob:fake-url')
    URL.revokeObjectURL = vi.fn()
  })

  it('shows the plant photo', async () => {
    const wrapper = mountRow(makeTask())
    await flushPromises()

    expect(mockedApi.getBlob).toHaveBeenCalledWith('/api/images/img1')
    const img = wrapper.find('img')
    expect(img.exists()).toBe(true)
    // The object URL, never the guarded endpoint — an <img src> to
    // /api/images/... carries no Authorization header and 401s.
    expect(img.attributes('src')).toBe('blob:fake-url')
  })

  it('badges the photo with the task type, not an emoji', () => {
    const wrapper = mountRow(makeTask({ taskType: 'repotting' }))
    const names = wrapper.findAllComponents(AppIcon).map((i) => i.props('name'))
    expect(names).toContain('repotting')
  })

  it('paints an overdue task in clay and a future one in stone', () => {
    const overdue = mountRow(makeTask({ dueAt: daysFromNow(-2) }))
    expect(overdue.find('.badge').classes()).toContain('bg-overdue-soft')

    const upcoming = mountRow(makeTask({ dueAt: daysFromNow(5) }))
    expect(upcoming.find('.badge').classes()).toContain('bg-idle-soft')
  })
})
