import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
  }
}

const APP_NAME = 'Zaindari'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { guest: true, title: 'Sign In' },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('../views/RegisterView.vue'),
      meta: { guest: true, title: 'Sign Up' },
    },
    {
      path: '/auth/callback',
      name: 'auth-callback',
      component: () => import('../views/AuthCallbackView.vue'),
      meta: { guest: true, title: 'Signing In' },
    },
    {
      path: '/',
      name: 'tasks',
      component: () => import('../views/TasksView.vue'),
      meta: { auth: true, title: 'Tasks' },
    },
    {
      path: '/inventory',
      name: 'inventory',
      component: () => import('../views/InventoryView.vue'),
      meta: { auth: true, title: 'Inventory' },
    },
    {
      path: '/plants/new',
      name: 'plant-new',
      component: () => import('../views/PlantFormView.vue'),
      meta: { auth: true, title: 'New Plant' },
    },
    {
      path: '/plants/:id',
      name: 'plant-detail',
      component: () => import('../views/PlantDetailView.vue'),
      meta: { auth: true, title: 'Plant' },
    },
    {
      path: '/plants/:id/edit',
      name: 'plant-edit',
      component: () => import('../views/PlantFormView.vue'),
      meta: { auth: true, title: 'Edit Plant' },
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../views/SettingsView.vue'),
      meta: { auth: true, title: 'Settings' },
    },
    {
      path: '/admin',
      component: () => import('../views/admin/AdminLayout.vue'),
      meta: { auth: true, admin: true, title: 'Admin' },
      children: [
        {
          path: '',
          redirect: '/admin/users',
        },
        {
          path: 'users',
          name: 'admin-users',
          component: () => import('../views/admin/UsersView.vue'),
          meta: { title: 'Admin · Users' },
        },
        {
          path: 'config',
          name: 'admin-config',
          component: () => import('../views/admin/ConfigView.vue'),
          meta: { title: 'Admin · Config' },
        },
        {
          path: 'schedules',
          name: 'admin-schedules',
          component: () => import('../views/admin/SchedulesView.vue'),
          meta: { title: 'Admin · Schedules' },
        },
        {
          path: 'oidc',
          name: 'admin-oidc',
          component: () => import('../views/admin/OidcView.vue'),
          meta: { title: 'Admin · OIDC' },
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
    return { name: 'tasks' }
  }

  if (to.meta.admin && !auth.isAdmin) {
    return { name: 'tasks' }
  }
})

// afterEach, not beforeEach: a guard that redirects must not leave the title of
// a page the user never actually landed on.
router.afterEach((to) => {
  document.title = to.meta.title ? `${APP_NAME} - ${to.meta.title}` : APP_NAME
})

export default router
