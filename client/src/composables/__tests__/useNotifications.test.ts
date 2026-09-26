import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick, ref } from 'vue'

vi.mock('../../api/push', () => ({
  pushApi: {
    getVapidKey: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  },
}))

import { pushApi } from '../../api/push'

// 'AQID' is base64url for the bytes [1, 2, 3].
const SERVER_KEY = 'AQID'

function makeSubscription(keyBytes: number[] | null) {
  return {
    endpoint: 'https://push.example/abc',
    options: {
      applicationServerKey: keyBytes ? new Uint8Array(keyBytes).buffer : null,
    },
    unsubscribe: vi.fn().mockResolvedValue(true),
  }
}

// The module keeps isSubscribed in module scope; load a fresh copy per test.
async function loadFresh() {
  vi.resetModules()
  return import('../useNotifications')
}

describe('syncPushSubscription', () => {
  let pushManager: {
    getSubscription: ReturnType<typeof vi.fn>
    subscribe: ReturnType<typeof vi.fn>
  }
  let swListeners: ((event: { data: unknown }) => void)[]

  beforeEach(() => {
    vi.mocked(pushApi.getVapidKey).mockResolvedValue({ publicKey: SERVER_KEY })
    vi.mocked(pushApi.subscribe).mockResolvedValue({ ok: true })

    pushManager = { getSubscription: vi.fn(), subscribe: vi.fn() }
    swListeners = []
    vi.stubGlobal('PushManager', class {})
    vi.stubGlobal('Notification', { permission: 'granted' })
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: Promise.resolve({ pushManager }),
        addEventListener: (_: string, fn: (event: { data: unknown }) => void) =>
          swListeners.push(fn),
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    delete (navigator as { serviceWorker?: unknown }).serviceWorker
  })

  it('re-sends the subscription the browser already holds', async () => {
    const sub = makeSubscription([1, 2, 3])
    pushManager.getSubscription.mockResolvedValue(sub)
    const { syncPushSubscription } = await loadFresh()

    await syncPushSubscription()

    expect(pushApi.subscribe).toHaveBeenCalledWith(sub)
    expect(sub.unsubscribe).not.toHaveBeenCalled()
  })

  it('does nothing when the user never enabled notifications', async () => {
    pushManager.getSubscription.mockResolvedValue(null)
    const { syncPushSubscription } = await loadFresh()

    await syncPushSubscription()

    // Turning notifications on is the user's call, not the sync's.
    expect(pushManager.subscribe).not.toHaveBeenCalled()
    expect(pushApi.subscribe).not.toHaveBeenCalled()
  })

  it('does nothing without notification permission', async () => {
    vi.stubGlobal('Notification', { permission: 'denied' })
    pushManager.getSubscription.mockResolvedValue(makeSubscription([1, 2, 3]))
    const { syncPushSubscription } = await loadFresh()

    await syncPushSubscription()

    expect(pushApi.subscribe).not.toHaveBeenCalled()
  })

  it('re-subscribes when the server has a different VAPID key', async () => {
    const stale = makeSubscription([9, 9, 9])
    const fresh = makeSubscription([1, 2, 3])
    pushManager.getSubscription.mockResolvedValue(stale)
    pushManager.subscribe.mockResolvedValue(fresh)
    const { syncPushSubscription } = await loadFresh()

    await syncPushSubscription()

    // Every push to a subscription signed for the old key is refused.
    expect(stale.unsubscribe).toHaveBeenCalled()
    expect(Array.from(pushManager.subscribe.mock.calls[0][0].applicationServerKey)).toEqual([
      1, 2, 3,
    ])
    expect(pushApi.subscribe).toHaveBeenCalledWith(fresh)
  })

  it('syncs on sign-in and when the service worker reports a change', async () => {
    pushManager.getSubscription.mockResolvedValue(makeSubscription([1, 2, 3]))
    const { initPushSubscriptionSync } = await loadFresh()
    const userId = ref<string | undefined>(undefined)

    initPushSubscriptionSync(() => userId.value)
    await vi.waitFor(() => expect(swListeners).toHaveLength(1))
    expect(pushApi.subscribe).not.toHaveBeenCalled()

    userId.value = 'user-1'
    await nextTick()
    await vi.waitFor(() => expect(pushApi.subscribe).toHaveBeenCalledTimes(1))

    swListeners[0]({ data: { type: 'PUSH_SUBSCRIPTION_CHANGED' } })
    await vi.waitFor(() => expect(pushApi.subscribe).toHaveBeenCalledTimes(2))
  })
})
