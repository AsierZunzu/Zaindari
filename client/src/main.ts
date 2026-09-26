import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { i18n, resolveInitialLocale, setLocale } from './i18n'
import { useAuthStore } from './stores/auth'
import { initInstallPrompt } from './composables/useInstallPrompt'
import { initPushSubscriptionSync } from './composables/useNotifications'
import './style.css'

const app = createApp(App)
const pinia = createPinia()

// First, and before anything renders: the browser's language is read here, so
// the login screen's very first paint is already in the right language rather
// than flashing English. Also before the router, whose afterEach hook
// translates the page title and needs the catalogs installed.
app.use(i18n)
setLocale(resolveInitialLocale())

app.use(pinia)
app.use(router)

// Before mount on purpose: the browser fires beforeinstallprompt once, and it
// can land before the first view has rendered. Registering it later means the
// install button never appears at all.
initInstallPrompt()

// The router guard awaits this same promise, so the first navigation resolves
// against a settled session rather than racing it.
const auth = useAuthStore()
auth.ensureInitialized().then(() => {
  app.mount('#app')
  initPushSubscriptionSync(() => auth.user?.id)
})
