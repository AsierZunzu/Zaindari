import { useI18n } from 'vue-i18n'
import { ApiError, NetworkError } from '../api/client'

/**
 * Turns whatever a `catch` block caught into a sentence the user can act on.
 *
 * Three cases, in order of how much we know:
 *
 *  1. `ApiError` with a `code` — the server named the failure, so translate it.
 *     Falls through to `fallbackKey` if this bundle predates the code, which
 *     can happen offline: the service worker may be serving an older shell than
 *     the server it is talking to.
 *  2. `NetworkError` — the server was never reached. Never show this as an
 *     operation-specific failure; "could not save" is misleading when nothing
 *     was ever sent.
 *  3. Anything else — the caller's `fallbackKey`, which should say what the app
 *     was trying to do ("Could not save this plant") rather than echo an
 *     English message from the server.
 */
export function useApiError() {
  const { t, te } = useI18n()

  function apiErrorMessage(error: unknown, fallbackKey = 'errors.generic'): string {
    if (error instanceof NetworkError) return t('errors.network')

    if (error instanceof ApiError && error.code) {
      const key = `errors.${error.code}`
      if (te(key)) return t(key, error.params ?? {})
    }

    return t(fallbackKey)
  }

  return { apiErrorMessage }
}
