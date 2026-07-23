import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth'
import './style.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// The router guard awaits this same promise, so the first navigation resolves
// against a settled session rather than racing it.
const auth = useAuthStore()
auth.ensureInitialized().then(() => {
  app.mount('#app')
})
