import { api } from './client'

export const pushApi = {
  getVapidKey(): Promise<{ publicKey: string }> {
    return api.get('/api/push/vapid-key')
  },

  subscribe(subscription: PushSubscription): Promise<{ ok: boolean }> {
    const key = subscription.getKey('p256dh')
    const auth = subscription.getKey('auth')
    return api.post('/api/push/subscribe', {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: key ? btoa(String.fromCharCode(...new Uint8Array(key))) : '',
        auth: auth ? btoa(String.fromCharCode(...new Uint8Array(auth))) : '',
      },
    })
  },

  unsubscribe(endpoint: string): Promise<{ ok: boolean }> {
    return api.request('DELETE', '/api/push/subscribe', { endpoint })
  },
}
