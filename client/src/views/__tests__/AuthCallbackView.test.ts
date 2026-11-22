import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import AuthCallbackView from '../AuthCallbackView.vue'
import { createTestI18n } from '../../test/i18n'
import { authApi } from '../../api/auth'
import type { User } from '../../types'

vi.mock('../../api/auth', () => ({
  authApi: { getMe: vi.fn() },
}))

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/login', component: { template: '<div />' } },
    { path: '/auth/callback', component: AuthCallbackView },
  ],
})

const profile = { id: 'user-1', username: 'asier', locale: 'en' } as User

function mountCallback() {
  return mount(AuthCallbackView, {
    global: { plugins: [router, createTestI18n()] },
  })
}

describe('AuthCallbackView', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    localStorage.clear()
    await router.push('/auth/callback')
  })

  it('adopts the session the api client refreshed into and goes home', async () => {
    // The real api client writes the refreshed token while recovering getMe's 401.
    vi.mocked(authApi.getMe).mockImplementation(async () => {
      localStorage.setItem('accessToken', 'from-refresh')
      return profile
    })

    mountCallback()
    await flushPromises()

    expect(localStorage.getItem('accessToken')).toBe('from-refresh')
    expect(JSON.parse(localStorage.getItem('authUser')!)).toMatchObject({ id: 'user-1' })
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('never reads a token from the URL', async () => {
    await router.push('/auth/callback?token=attacker')
    vi.mocked(authApi.getMe).mockRejectedValue(new Error('no session'))

    const wrapper = mountCallback()
    await flushPromises()

    expect(localStorage.getItem('accessToken')).toBeNull()
    expect(wrapper.text()).toContain('Back to Login')
  })
})
