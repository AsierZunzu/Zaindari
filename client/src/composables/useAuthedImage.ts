import { onUnmounted, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { api } from '../api/client'

/**
 * Loads a guarded image endpoint into an object URL fit for an `<img src>`.
 *
 * The browser issues subresource loads itself and never attaches our
 * Authorization header, so pointing an `<img>` straight at /api/images/:id just
 * earns a 401 and a broken-image glyph. Reading the bytes through the api
 * client instead keeps the request authenticated -- and inherits its automatic
 * refresh on an expired access token.
 */
export function useAuthedImage(source: MaybeRefOrGetter<string | null | undefined>) {
  const src = ref<string | null>(null)
  const failed = ref(false)

  /**
   * Monotonic request id. Sources can change faster than the network answers
   * (flicking through image history), and without this the image shown would be
   * whichever fetch happened to settle last rather than the one now selected.
   */
  let latest = 0

  function release() {
    if (src.value) {
      URL.revokeObjectURL(src.value)
      src.value = null
    }
  }

  watch(
    () => toValue(source),
    async (url) => {
      const request = ++latest
      release()
      failed.value = false

      if (!url) {
        return
      }

      try {
        const blob = await api.getBlob(url)
        if (request !== latest) {
          return
        }
        src.value = URL.createObjectURL(blob)
      } catch {
        if (request === latest) {
          failed.value = true
        }
      }
    },
    { immediate: true },
  )

  // Object URLs pin their blob in memory until revoked; a dashboard of plant
  // cards would otherwise leak one full-size image per card on every visit.
  onUnmounted(release)

  return { src, failed }
}
