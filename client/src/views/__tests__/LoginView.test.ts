import { describe, it, expect, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../LoginView.vue'
import { createTestI18n } from '../../test/i18n'
import { authApi } from '../../api/auth'

vi.mock('../../api/auth', () => ({
  authApi: {
    oidcStatus: vi.fn(),
    oidcStart: vi.fn(),
  },
}))

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
      plugins: [router, createTestI18n()],
    },
  })
}

describe('LoginView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(authApi.oidcStatus).mockResolvedValue({ enabled: false, name: null })
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

  it('explains that the session expired when sent here by the api client', async () => {
    await router.push('/login?expired=1')
    const wrapper = mountLogin()
    expect(wrapper.text()).toContain('Your session has expired. Please sign in again.')
  })

  it('shows no expiry notice when opened directly', async () => {
    await router.push('/login')
    const wrapper = mountLogin()
    expect(wrapper.text()).not.toContain('Your session has expired')
  })

  it('has link to register page', () => {
    const wrapper = mountLogin()
    expect(wrapper.text()).toContain('Sign up')
  })

  it('hides single sign-on when the server has none', async () => {
    const wrapper = mountLogin()
    await flushPromises()
    expect(wrapper.text()).not.toContain('Sign in with')
  })

  it('offers single sign-on under the provider name', async () => {
    vi.mocked(authApi.oidcStatus).mockResolvedValue({ enabled: true, name: 'Authentik' })
    const wrapper = mountLogin()
    await flushPromises()
    expect(wrapper.text()).toContain('Sign in with Authentik')
  })

  it('words the error the OIDC callback redirected back with', async () => {
    await router.push('/login?sso=auth.signupDisabled')
    const wrapper = mountLogin()
    expect(wrapper.text()).toContain('Sign-ups are currently disabled.')
  })

  it('falls back to a generic SSO error for an unknown code', async () => {
    await router.push('/login?sso=auth.somethingNew')
    const wrapper = mountLogin()
    expect(wrapper.text()).toContain('Single sign-on could not be completed.')
  })
})
