import { ref, computed, watch } from 'vue'
import { pushApi } from '../api/push'

// Uint8Array<ArrayBuffer>, not bare Uint8Array: since TS 5.7 the bare form widens
// to Uint8Array<ArrayBufferLike>, which PushSubscriptionOptions.applicationServerKey
// rejects because ArrayBufferLike admits SharedArrayBuffer.
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
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

/** Message the service worker posts when the browser replaced the subscription. */
export const PUSH_SUBSCRIPTION_CHANGED = 'PUSH_SUBSCRIPTION_CHANGED'

function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window
}

function sameKey(current: ArrayBuffer | null, publicKey: string): boolean {
  // Not every browser exposes the key; without it there is nothing to compare.
  if (!current) return true
  const a = new Uint8Array(current)
  const b = urlBase64ToUint8Array(publicKey)
  return a.length === b.length && a.every((byte, i) => byte === b[i])
}

/**
 * Tells the server about this device's push subscription again.
 *
 * The browser owns the subscription and the server only holds a copy, and the
 * two drift apart: a browser rotates its endpoint, the server drops a row
 * after a 410, a restored database regenerates the VAPID keys. Before this,
 * the copy was written once when the toggle was flipped, so any drift left
 * Settings showing notifications on while nothing was ever delivered.
 *
 * Only an existing subscription is re-sent. No subscription means the user
 * never enabled notifications or switched them off, and that is theirs to
 * decide. The server upserts by endpoint, so repeating this is harmless.
 */
export async function syncPushSubscription(): Promise<void> {
  if (!pushSupported() || Notification.permission !== 'granted') return

  const registration = await navigator.serviceWorker.ready
  let sub = await registration.pushManager.getSubscription()
  if (!sub) return

  const { publicKey } = await pushApi.getVapidKey()
  if (publicKey && !sameKey(sub.options.applicationServerKey, publicKey)) {
    // Signed for a keypair the server no longer has, so every push to it is
    // refused. The browser will not subscribe under a new key while the old
    // subscription exists, hence the unsubscribe first. Permission is already
    // granted, so no prompt is shown.
    await sub.unsubscribe()
    sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })
  }

  await pushApi.subscribe(sub)
  isSubscribed.value = true
}

/**
 * Keeps the server's copy of the subscription current for whoever is signed
 * in: at boot, on every sign-in (which also moves a shared device's
 * subscription to the new account), and whenever the service worker reports
 * that the browser replaced it.
 */
export function initPushSubscriptionSync(currentUserId: () => string | undefined) {
  if (!pushSupported()) return

  // Best-effort: offline, or no service worker in dev. The next boot retries.
  const sync = () => {
    if (currentUserId()) syncPushSubscription().catch(() => {})
  }

  watch(currentUserId, sync, { immediate: true })
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === PUSH_SUBSCRIPTION_CHANGED) sync()
  })
}

export function useNotifications() {
  const isSupported = computed(pushSupported)

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
