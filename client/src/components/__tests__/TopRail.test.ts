import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import TopRail from '../TopRail.vue'
import { createTestI18n } from '../../test/i18n'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/garden', component: { template: '<div />' } },
    { path: '/plants/new', component: { template: '<div />' } },
    { path: '/settings', component: { template: '<div />' } },
    { path: '/admin', component: { template: '<div />' } },
  ],
})

function mountRail() {
  return mount(TopRail, { global: { plugins: [router, createTestI18n()] } })
}

describe('TopRail', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders the app name', () => {
    expect(mountRail().text()).toContain('Zaindari')
  })

  it('links care at the root so it stays the default page', () => {
    const links = mountRail()
      .findAll('a')
      .map((a) => ({ to: a.attributes('href'), text: a.text() }))
    expect(links).toContainEqual({ to: '/', text: 'Care' })
    expect(links).toContainEqual({ to: '/garden', text: 'Garden' })
    expect(links).toContainEqual({ to: '/plants/new', text: 'Add plant' })
  })

  it('shows settings and logout in the account menu', async () => {
    const wrapper = mountRail()
    expect(wrapper.text()).not.toContain('Logout')

    await wrapper.find('button').trigger('click')
    expect(wrapper.text()).toContain('Settings')
    expect(wrapper.text()).toContain('Logout')
  })
})
