import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { guest: true },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('../views/RegisterView.vue'),
      meta: { guest: true },
    },
    {
      path: '/',
      name: 'dashboard',
      component: () => import('../views/DashboardView.vue'),
      meta: { auth: true },
    },
    {
      path: '/plants/new',
      name: 'plant-new',
      component: () => import('../views/PlantFormView.vue'),
      meta: { auth: true },
    },
    {
      path: '/plants/:id',
      name: 'plant-detail',
      component: () => import('../views/PlantDetailView.vue'),
      meta: { auth: true },
    },
    {
      path: '/plants/:id/edit',
      name: 'plant-edit',
      component: () => import('../views/PlantFormView.vue'),
      meta: { auth: true },
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../views/SettingsView.vue'),
      meta: { auth: true },
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('../views/admin/AdminLayout.vue'),
      meta: { auth: true, admin: true },
    },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()

  if (to.meta.auth && !auth.isAuthenticated) {
    return { name: 'login' }
  }

  if (to.meta.guest && auth.isAuthenticated) {
    return { name: 'dashboard' }
  }

  if (to.meta.admin && !auth.isAdmin) {
    return { name: 'dashboard' }
  }
})

export default router
