import { api, ApiError } from './client'
import { validateImageFile } from '../utils/image'
import type { Plant, PlantImage } from '../types'

export interface PlantWithImage extends Plant {
  currentImage: PlantImage | null
}

export const plantsApi = {
  list(): Promise<PlantWithImage[]> {
    return api.get('/api/plants')
  },

  create(data: { name: string; location?: string; instructions?: string }): Promise<Plant> {
    return api.post('/api/plants', data)
  },

  get(id: string): Promise<PlantWithImage> {
    return api.get(`/api/plants/${id}`)
  },

  update(id: string, data: Partial<Pick<Plant, 'name' | 'location' | 'instructions'>>): Promise<Plant> {
    return api.patch(`/api/plants/${id}`, data)
  },

  delete(id: string): Promise<void> {
    return api.delete(`/api/plants/${id}`)
  },

  getImages(id: string): Promise<PlantImage[]> {
    return api.get(`/api/plants/${id}/images`)
  },

  async uploadImage(id: string, file: File): Promise<PlantImage> {
    // ImageUpload.vue already rejects these at selection time; this repeats the
    // check so no caller can start a request the server is certain to refuse.
    const validationError = validateImageFile(file)
    if (validationError) {
      // An ApiError, not a plain Error: it carries the code, so the catch site
      // renders the same sentence it would for the server's own rejection.
      throw new ApiError(
        400,
        `Image rejected: ${validationError.code}`,
        validationError.code,
        validationError.params,
      )
    }

    const formData = new FormData()
    // Must match FileInterceptor('image') in the server's plants.controller.ts.
    formData.append('image', file)

    const token = localStorage.getItem('accessToken')
    const headers: Record<string, string> = {}
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const response = await fetch(`/api/plants/${id}/images`, {
      method: 'POST',
      headers,
      body: formData,
    })

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: response.statusText }))
      throw new Error(errorBody.message || response.statusText)
    }

    return response.json()
  },

  getShares(id: string): Promise<Array<{ userId: string; username: string; displayName: string }>> {
    return api.get(`/api/plants/${id}/shares`)
  },

  share(id: string, userId: string): Promise<void> {
    return api.post(`/api/plants/${id}/shares`, { userId })
  },

  unshare(id: string, userId: string): Promise<void> {
    return api.delete(`/api/plants/${id}/shares/${userId}`)
  },
}
