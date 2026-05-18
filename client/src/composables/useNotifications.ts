import { ref, computed } from 'vue'
import { pushApi } from '../api/push'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

const permission = ref<NotificationPermission>(
  typeof Notification !== 'undefined' ? Notification.permission : 'default',
)
const isSubscribed = ref(false)

export function useNotifications() {
  const isSupported = computed(
    () => 'serviceWorker' in navigator && 'PushManager' in window,
  )

  async function checkSubscription() {
    if (!isSupported.value) return
    const registration = await navigator.serviceWorker.ready
    const sub = await registration.pushManager.getSubscription()
    isSubscribed.value = !!sub
  }

  async function subscribe() {
    if (!isSupported.value) return

    const perm = await Notification.requestPermission()
    permission.value = perm
    if (perm !== 'granted') return

    const registration = await navigator.serviceWorker.ready
    const { publicKey } = await pushApi.getVapidKey()

    const sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })

    await pushApi.subscribe(sub)
    isSubscribed.value = true
  }

  async function unsubscribe() {
    if (!isSupported.value) return

    const registration = await navigator.serviceWorker.ready
    const sub = await registration.pushManager.getSubscription()
    if (sub) {
      await pushApi.unsubscribe(sub.endpoint)
      await sub.unsubscribe()
    }
    isSubscribed.value = false
  }

  // Check initial state
  checkSubscription()

  return {
    isSupported,
    permission,
    isSubscribed,
    subscribe,
    unsubscribe,
  }
}
