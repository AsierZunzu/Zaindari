class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

class ApiClient {
  private getToken(): string | null {
    return localStorage.getItem('accessToken')
  }

  private setToken(token: string) {
    localStorage.setItem('accessToken', token)
  }

  private clearToken() {
    localStorage.removeItem('accessToken')
  }

  async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    const token = this.getToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    if (response.status === 401 && token) {
      try {
        const refreshRes = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        })

        if (refreshRes.ok) {
          const data = await refreshRes.json()
          this.setToken(data.accessToken)
          headers['Authorization'] = `Bearer ${data.accessToken}`
          const retryRes = await fetch(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
          })
          if (!retryRes.ok) {
            throw new ApiError(retryRes.status, await retryRes.text())
          }
          const retryText = await retryRes.text()
          return (retryText ? JSON.parse(retryText) : undefined) as T
        }
      } catch {
        // refresh failed
      }

      this.clearToken()
      window.location.href = '/login'
      throw new ApiError(401, 'Session expired')
    }

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: response.statusText }))
      throw new ApiError(response.status, errorBody.message || response.statusText)
    }

    const text = await response.text()
    return (text ? JSON.parse(text) : undefined) as T
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
export { ApiError }
