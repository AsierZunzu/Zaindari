import { createRouter, createWebHistory, type RouteLocationNormalized } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { i18n } from '../i18n'

declare module 'vue-router' {
  interface RouteMeta {
    /** Key into `routes.*`; resolved at navigation time, not at definition. */
    titleKey?: string
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { guest: true, titleKey: 'routes.login' },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('../views/RegisterView.vue'),
      meta: { guest: true, titleKey: 'routes.register' },
    },
    {
      path: '/auth/callback',
      name: 'auth-callback',
      component: () => import('../views/AuthCallbackView.vue'),
      meta: { guest: true, titleKey: 'routes.authCallback' },
    },
    {
      path: '/',
      name: 'tasks',
      component: () => import('../views/TasksView.vue'),
      meta: { auth: true, titleKey: 'routes.care' },
    },
    {
      path: '/garden',
      name: 'garden',
      component: () => import('../views/GardenView.vue'),
      meta: { auth: true, titleKey: 'routes.garden' },
    },
    {
      // The screen was called "Inventory" until the redesign. Anyone who
      // bookmarked it — or installed the PWA while it was the start URL —
      // still has the old path.
      path: '/inventory',
      redirect: '/garden',
    },
    {
      path: '/plants/new',
      name: 'plant-new',
      component: () => import('../views/PlantFormView.vue'),
      meta: { auth: true, titleKey: 'routes.plantNew' },
    },
    {
      path: '/plants/:id',
      name: 'plant-detail',
      component: () => import('../views/PlantDetailView.vue'),
      meta: { auth: true, titleKey: 'routes.plantDetail' },
    },
    {
      path: '/plants/:id/edit',
      name: 'plant-edit',
      component: () => import('../views/PlantFormView.vue'),
      meta: { auth: true, titleKey: 'routes.plantEdit' },
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../views/SettingsView.vue'),
      meta: { auth: true, titleKey: 'routes.settings' },
    },
    {
      path: '/admin',
      component: () => import('../views/admin/AdminLayout.vue'),
      meta: { auth: true, admin: true, titleKey: 'routes.admin' },
      children: [
        {
          path: '',
          redirect: '/admin/users',
        },
        {
          path: 'users',
          name: 'admin-users',
          component: () => import('../views/admin/UsersView.vue'),
          meta: { titleKey: 'routes.adminUsers' },
        },
        {
          path: 'config',
          name: 'admin-config',
          component: () => import('../views/admin/ConfigView.vue'),
          meta: { titleKey: 'routes.adminConfig' },
        },
        {
          path: 'schedules',
          name: 'admin-schedules',
          component: () => import('../views/admin/SchedulesView.vue'),
          meta: { titleKey: 'routes.adminSchedules' },
        },
        {
          path: 'oidc',
          name: 'admin-oidc',
          component: () => import('../views/admin/OidcView.vue'),
          meta: { titleKey: 'routes.adminOidc' },
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

function applyTitle(route: RouteLocationNormalized) {
  const { t } = i18n.global
  const appName = t('app.name')
  document.title = route.meta.titleKey
    ? `${appName} - ${t(route.meta.titleKey)}`
    : appName
}

// afterEach, not beforeEach: a guard that redirects must not leave the title of
// a page the user never actually landed on.
router.afterEach(applyTitle)

/**
 * Retitles the open tab when the language changes. Titles are only written on
 * navigation, so without this the tab keeps the previous language's title until
 * the user happens to navigate.
 */
export function refreshDocumentTitle() {
  applyTitle(router.currentRoute.value)
}

export default router
