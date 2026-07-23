import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import InventoryView from '../InventoryView.vue'

vi.mock('../../api/dashboard', () => ({
  dashboardApi: {
    get: vi.fn().mockResolvedValue([]),
  },
}))

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/inventory', component: { template: '<div />' } },
    { path: '/plants/new', component: { template: '<div />' } },
    { path: '/plants/:id', component: { template: '<div />' } },
  ],
})

function mountInventory() {
  return mount(InventoryView, {
    global: {
      plugins: [router],
    },
  })
}

describe('InventoryView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('shows empty state when there are no plants', async () => {
    const wrapper = mountInventory()
    await flushPromises()
    expect(wrapper.text()).toContain('No plants yet')
    expect(wrapper.text()).toContain('Add Your First Plant')
  })

  it('is titled Inventory', () => {
    const wrapper = mountInventory()
    expect(wrapper.find('h1').text()).toBe('Inventory')
  })
})
