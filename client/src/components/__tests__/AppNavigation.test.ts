import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import AppNavigation from '../AppNavigation.vue'
import { createTestI18n } from '../../test/i18n'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/inventory', component: { template: '<div />' } },
    { path: '/plants/new', component: { template: '<div />' } },
    { path: '/settings', component: { template: '<div />' } },
    { path: '/admin', component: { template: '<div />' } },
  ],
})

function mountNav() {
  return mount(AppNavigation, {
    global: {
      plugins: [router, createTestI18n()],
    },
  })
}

describe('AppNavigation', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders the app name', () => {
    const wrapper = mountNav()
    expect(wrapper.text()).toContain('Zaindari')
  })

  it('renders tasks, inventory and add plant links', () => {
    const wrapper = mountNav()
    expect(wrapper.text()).toContain('Tasks')
    expect(wrapper.text()).toContain('Inventory')
    expect(wrapper.text()).toContain('+ Add Plant')
  })

  it('points Tasks at the root so it stays the default page', () => {
    const wrapper = mountNav()
    const links = wrapper.findAll('a').map((a) => ({ to: a.attributes('href'), text: a.text() }))
    expect(links).toContainEqual({ to: '/', text: 'Tasks' })
    expect(links).toContainEqual({ to: '/inventory', text: 'Inventory' })
  })

  it('shows logout in mobile menu when opened', async () => {
    const wrapper = mountNav()
    const hamburger = wrapper.find('button')
    await hamburger.trigger('click')
    expect(wrapper.text()).toContain('Logout')
  })
})
