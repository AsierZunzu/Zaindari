import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi } from '../api/auth'
import type { User, RegisterData } from '../types'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const accessToken = ref<string | null>(localStorage.getItem('accessToken'))

  const isAuthenticated = computed(() => !!accessToken.value && !!user.value)
  const isAdmin = computed(() => user.value?.isAdmin ?? false)

  async function login(username: string, password: string) {
    const response = await authApi.login(username, password)
    accessToken.value = response.accessToken
    user.value = response.user
    localStorage.setItem('accessToken', response.accessToken)
  }

  async function register(data: RegisterData) {
    const response = await authApi.register(data)
    accessToken.value = response.accessToken
    user.value = response.user
    localStorage.setItem('accessToken', response.accessToken)
  }

  function logout() {
    accessToken.value = null
    user.value = null
    localStorage.removeItem('accessToken')
  }

  async function refreshToken() {
    const response = await authApi.refreshToken()
    accessToken.value = response.accessToken
    localStorage.setItem('accessToken', response.accessToken)
  }

  async function initialize() {
    if (!accessToken.value) return
    try {
      user.value = await authApi.getMe()
    } catch {
      accessToken.value = null
      localStorage.removeItem('accessToken')
    }
  }

  return {
    user,
    accessToken,
    isAuthenticated,
    isAdmin,
    login,
    register,
    logout,
    refreshToken,
    initialize,
  }
})
