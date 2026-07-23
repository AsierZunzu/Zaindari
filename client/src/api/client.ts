class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
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
          throw new ApiError(response.status, 'Session expired')
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
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    const token = this.getToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    return fetch(url, {
      method,
      headers,
      credentials: 'same-origin',
      body: body ? JSON.stringify(body) : undefined,
    }).catch((err) => {
      throw new NetworkError(err)
    })
  }

  private endSession(): never {
    this.clearToken()
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login'
    }
    throw new ApiError(401, 'Session expired')
  }

  private async parse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: response.statusText }))
      throw new ApiError(response.status, errorBody.message || response.statusText)
    }

    const text = await response.text()
    return (text ? JSON.parse(text) : undefined) as T
  }

  async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    const response = await this.sendRequest(method, url, body)

    if (response.status !== 401) {
      return this.parse<T>(response)
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

    return this.parse<T>(retry)
  }

  get<T>(url: string): Promise<T> {
    return this.request<T>('GET', url)
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

export const api = new ApiClient()
export { ApiError, NetworkError }
