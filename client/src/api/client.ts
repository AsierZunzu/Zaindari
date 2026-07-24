class ApiError extends Error {
  status: number
  /**
   * Stable identifier for the errors a user reads, e.g. `auth.usernameTaken`.
   * The server sends it alongside an English `message`; the client owns the
   * wording so the error is in the *user's* language, not the request's.
   * Absent for errors the server never expected anyone to read.
   */
  code?: string
  /** Values the translated sentence interpolates, e.g. `{ mb: 10 }`. */
  params?: Record<string, string | number>

  constructor(
    status: number,
    message: string,
    code?: string,
    params?: Record<string, string | number>,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.params = params
  }
}

/** Thrown when the server could not be reached at all (offline, restarting, proxy down). */
class NetworkError extends Error {
  constructor(cause?: unknown) {
    super('Could not reach the server')
    this.name = 'NetworkError'
    this.cause = cause
  }
}

class ApiClient {
  /**
   * Single-flight guard: a page that fires several requests at once must not
   * trigger several parallel refreshes. Because refresh tokens rotate, the
   * second concurrent refresh would present an already-consumed token and trip
   * the server's reuse detection, killing the session it was trying to save.
   */
  private refreshPromise: Promise<string> | null = null

  private getToken(): string | null {
    return localStorage.getItem('accessToken')
  }

  private setToken(token: string) {
    localStorage.setItem('accessToken', token)
  }

  private clearToken() {
    localStorage.removeItem('accessToken')
  }

  /**
   * Exchanges the httpOnly refresh cookie for a new access token. Carries no
   * Authorization header on purpose — the cookie is the credential, which is
   * what lets this succeed after the access token has already expired.
   */
  private refreshAccessToken(): Promise<string> {
    if (!this.refreshPromise) {
      this.refreshPromise = (async () => {
        const response = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'same-origin',
        }).catch((err) => {
          throw new NetworkError(err)
        })

        if (!response.ok) {
          throw new ApiError(response.status, 'Session expired', 'auth.sessionExpired')
        }

        const data = await response.json()
        this.setToken(data.accessToken)
        return data.accessToken as string
      })().finally(() => {
        this.refreshPromise = null
      })
    }

    return this.refreshPromise
  }

  private sendRequest(method: string, url: string, body?: unknown): Promise<Response> {
    const isForm = body instanceof FormData

    // A multipart body must not carry a Content-Type we wrote: the browser has
    // to set it itself so it can append the boundary, and overriding it makes
    // the server unable to parse a request that otherwise looks fine.
    const headers: Record<string, string> = isForm
      ? {}
      : { 'Content-Type': 'application/json' }

    const token = this.getToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    return fetch(url, {
      method,
      headers,
      credentials: 'same-origin',
      body: isForm ? body : body ? JSON.stringify(body) : undefined,
    }).catch((err) => {
      throw new NetworkError(err)
    })
  }

  private endSession(): never {
    this.clearToken()
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login'
    }
    throw new ApiError(401, 'Session expired', 'auth.sessionExpired')
  }

  private async parse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: response.statusText }))
      throw new ApiError(
        response.status,
        errorBody.message || response.statusText,
        errorBody.code,
        errorBody.params,
      )
    }

    const text = await response.text()
    return (text ? JSON.parse(text) : undefined) as T
  }

  /**
   * Sends a request, transparently recovering from a 401 via the refresh
   * cookie. Hands back the raw Response so callers can decode it as JSON or as
   * binary without duplicating the session-recovery dance.
   */
  private async fetchAuthed(method: string, url: string, body?: unknown): Promise<Response> {
    const response = await this.sendRequest(method, url, body)

    if (response.status !== 401) {
      return response
    }

    // Attempt recovery via the refresh cookie. Worth trying even with no access
    // token in localStorage — the cookie may well have outlived it.
    try {
      await this.refreshAccessToken()
    } catch (err) {
      // A refresh that failed because the server is unreachable says nothing
      // about whether the session is valid, so keep it and surface the outage.
      if (err instanceof NetworkError) {
        throw err
      }
      this.endSession()
    }

    const retry = await this.sendRequest(method, url, body)
    if (retry.status === 401) {
      this.endSession()
    }

    return retry
  }

  async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    return this.parse<T>(await this.fetchAuthed(method, url, body))
  }

  /**
   * Fetches a binary resource as a Blob. Exists because a browser-issued
   * subresource load -- an `<img src>`, say -- carries no Authorization header,
   * so guarded endpoints have to be read through the client and handed to the
   * element as an object URL instead.
   */
  async getBlob(url: string): Promise<Blob> {
    const response = await this.fetchAuthed('GET', url)

    if (!response.ok) {
      throw new ApiError(response.status, response.statusText)
    }

    return response.blob()
  }

  /**
   * Fetches a binary resource along with the filename the server named it.
   *
   * Separate from `getBlob` because a download needs the `Content-Disposition`
   * the server sent, and a Blob alone has thrown it away. Goes through
   * `fetchAuthed`, so an expired access token is refreshed rather than turning
   * a 30 MB download into a silent sign-out.
   */
  async getFile(url: string, fallbackFilename: string): Promise<{ blob: Blob; filename: string }> {
    const response = await this.fetchAuthed('GET', url)

    if (!response.ok) {
      // Errors on this route are still JSON, so decode them the usual way to
      // keep the translatable code rather than reporting a broken download.
      return this.parse(response)
    }

    return {
      blob: await response.blob(),
      filename: filenameFrom(response.headers.get('Content-Disposition')) ?? fallbackFilename,
    }
  }

  get<T>(url: string): Promise<T> {
    return this.request<T>('GET', url)
  }

  /** POSTs multipart form data, with the same 401 recovery as every other call. */
  postForm<T>(url: string, form: FormData): Promise<T> {
    return this.request<T>('POST', url, form)
  }

  post<T>(url: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', url, body)
  }

  patch<T>(url: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', url, body)
  }

  delete<T>(url: string): Promise<T> {
    return this.request<T>('DELETE', url)
  }

  put<T>(url: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', url, body)
  }
}

/**
 * Pulls the filename out of a Content-Disposition header.
 *
 * Only the plain `filename="..."` form is read, because that is the only form
 * this server sends — it reduces the name to ASCII before writing the header,
 * so there is no RFC 5987 `filename*` twin to prefer. Anything unrecognised
 * yields null and the caller's own name is used.
 */
function filenameFrom(header: string | null): string | null {
  const match = header?.match(/filename="([^"]+)"/)
  return match ? match[1] : null
}

export const api = new ApiClient()
export { ApiError, NetworkError }
