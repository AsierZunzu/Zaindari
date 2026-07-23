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
      path: '/auth/callback',
      name: 'auth-callback',
      component: () => import('../views/AuthCallbackView.vue'),
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
      component: () => import('../views/admin/AdminLayout.vue'),
      meta: { auth: true, admin: true },
      children: [
        {
          path: '',
          redirect: '/admin/users',
        },
        {
          path: 'users',
          name: 'admin-users',
          component: () => import('../views/admin/UsersView.vue'),
        },
        {
          path: 'config',
          name: 'admin-config',
          component: () => import('../views/admin/ConfigView.vue'),
        },
        {
          path: 'schedules',
          name: 'admin-schedules',
          component: () => import('../views/admin/SchedulesView.vue'),
        },
        {
          path: 'oidc',
          name: 'admin-oidc',
          component: () => import('../views/admin/OidcView.vue'),
        },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  // vue-router begins the initial navigation during app.use(router), while the
  // session is still being validated. Without waiting, a perfectly valid
  // session looks logged-out and every reload lands on /login.
  await auth.ensureInitialized()

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
