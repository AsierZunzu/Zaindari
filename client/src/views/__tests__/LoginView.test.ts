import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../LoginView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/login', component: { template: '<div />' } },
    { path: '/register', component: { template: '<div />' } },
  ],
})

function mountLogin() {
  return mount(LoginView, {
    global: {
      plugins: [router],
    },
  })
}

describe('LoginView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders login form', () => {
    const wrapper = mountLogin()
    expect(wrapper.find('input#username').exists()).toBe(true)
    expect(wrapper.find('input#password').exists()).toBe(true)
    expect(wrapper.text()).toContain('Sign In')
  })

  it('shows error on empty submit', async () => {
    const wrapper = mountLogin()
    await wrapper.find('form').trigger('submit')
    expect(wrapper.text()).toContain('Please fill in all fields')
  })

  it('has link to register page', () => {
    const wrapper = mountLogin()
    expect(wrapper.text()).toContain('Sign up')
  })
})
