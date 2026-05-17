import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '../DashboardView.vue'

vi.mock('../../api/plants', () => ({
  plantsApi: {
    list: vi.fn().mockResolvedValue([]),
  },
}))

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/plants/new', component: { template: '<div />' } },
    { path: '/plants/:id', component: { template: '<div />' } },
  ],
})

function mountDashboard() {
  return mount(DashboardView, {
    global: {
      plugins: [router],
    },
  })
}

describe('DashboardView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('shows empty state when there are no plants', async () => {
    const wrapper = mountDashboard()
    await flushPromises()
    expect(wrapper.text()).toContain('No plants yet')
    expect(wrapper.text()).toContain('Add Your First Plant')
  })

  it('shows the welcome message', () => {
    const wrapper = mountDashboard()
    expect(wrapper.text()).toContain('Welcome back')
  })
})
