import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import GardenView from '../GardenView.vue'
import { createTestI18n } from '../../test/i18n'

vi.mock('../../api/dashboard', () => ({
  dashboardApi: {
    get: vi.fn().mockResolvedValue([]),
  },
}))

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/garden', component: { template: '<div />' } },
    { path: '/plants/new', component: { template: '<div />' } },
    { path: '/plants/:id', component: { template: '<div />' } },
  ],
})

function mountGarden() {
  return mount(GardenView, {
    global: {
      plugins: [router, createTestI18n()],
    },
  })
}

describe('GardenView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('shows empty state when there are no plants', async () => {
    const wrapper = mountGarden()
    await flushPromises()
    expect(wrapper.text()).toContain('No plants yet')
    expect(wrapper.text()).toContain('Add your first plant')
  })

  it('is titled Garden', () => {
    const wrapper = mountGarden()
    expect(wrapper.find('h1').text()).toBe('Garden')
  })
})
