import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import BottomBar from '../BottomBar.vue'
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

function mountBar() {
  return mount(BottomBar, {
    global: { plugins: [router, createTestI18n()] },
    // The account sheet is teleported to `body`, which needs somewhere to go.
    attachTo: document.body,
  })
}

describe('BottomBar', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    document.body.innerHTML = ''
  })

  it('offers care, garden and add plant as destinations', () => {
    const wrapper = mountBar()
    const links = wrapper.findAll('a').map((a) => a.attributes('href'))
    expect(links).toEqual(['/', '/garden', '/plants/new'])
  })

  it('keeps settings and logout behind the account tab', async () => {
    const wrapper = mountBar()
    expect(document.body.textContent).not.toContain('Logout')

    await wrapper.find('button').trigger('click')
    expect(document.body.textContent).toContain('Settings')
    expect(document.body.textContent).toContain('Logout')
  })

  it('marks the care tab active only on the route it points at', async () => {
    await router.push('/garden')
    await router.isReady()
    const wrapper = mountBar()

    const [care, garden] = wrapper.findAll('a')
    // `/` is a prefix of every route in the app, so this is the assertion that
    // catches an `active-class` where `exact-active-class` was meant.
    expect(care.classes()).not.toContain('!text-primary-700')
    expect(garden.classes()).toContain('!text-primary-700')
  })
})
