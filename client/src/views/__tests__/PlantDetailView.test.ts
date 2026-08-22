import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import PlantDetailView from '../PlantDetailView.vue'
import { createTestI18n } from '../../test/i18n'

vi.mock('../../api/plants', () => ({
  plantsApi: {
    get: vi.fn(),
    getImages: vi.fn(),
    delete: vi.fn(),
  },
}))
vi.mock('../../api/tasks', () => ({
  tasksApi: { getForPlant: vi.fn() },
}))

import { plantsApi } from '../../api/plants'
import { tasksApi } from '../../api/tasks'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/garden', component: { template: '<div />' } },
    { path: '/plants/:id', component: { template: '<div />' } },
    { path: '/plants/:id/edit', component: { template: '<div />' } },
  ],
})

const plant = {
  id: 'p1',
  name: 'Monstera',
  location: 'Kitchen',
  instructions: null,
  ownerId: 'u1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  currentImage: null,
}

async function mountDetail(images: unknown[] = []) {
  vi.mocked(plantsApi.get).mockResolvedValue(plant as never)
  vi.mocked(plantsApi.getImages).mockResolvedValue(images as never)
  vi.mocked(tasksApi.getForPlant).mockResolvedValue([] as never)

  await router.push('/plants/p1')
  await router.isReady()

  const wrapper = mount(PlantDetailView, {
    global: {
      plugins: [router, createTestI18n()],
      // Both fetch on mount and neither is what these tests are about.
      stubs: { ScheduleEditor: true, ShareDialog: true },
    },
  })
  await flushPromises()
  return wrapper
}

describe('PlantDetailView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens on the tasks pane and switches to schedules', async () => {
    const wrapper = await mountDetail()

    expect(wrapper.findComponent({ name: 'TaskList' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'ScheduleEditor' }).exists()).toBe(false)

    const [, schedules] = wrapper.findAll('[role="group"] button')
    await schedules.trigger('click')

    // One pane at a time: the page used to render all of them stacked.
    expect(wrapper.findComponent({ name: 'TaskList' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'ScheduleEditor' }).exists()).toBe(true)
  })

  it('offers no photos pane until the plant has been photographed', async () => {
    const withoutPhotos = await mountDetail([])
    expect(withoutPhotos.findAll('[role="group"] button')).toHaveLength(2)

    const withPhotos = await mountDetail([
      { id: 'img1', plantId: 'p1', filePath: 'a.webp', isCurrent: true, createdAt: '2026-01-01' },
    ])
    const labels = withPhotos.findAll('[role="group"] button').map((b) => b.text())
    expect(labels).toEqual(['Tasks', 'Schedules', 'Photos'])
  })

  it('keeps delete away from the edit and share controls', async () => {
    const wrapper = await mountDetail()
    // Edit and share sit in the header; delete is behind a rule at the foot of
    // the page, so it cannot be hit by a thumb aiming for Edit.
    expect(wrapper.find('.btn-danger').exists()).toBe(true)
    expect(wrapper.find('.btn-danger').text()).toContain('Delete')
  })
})
