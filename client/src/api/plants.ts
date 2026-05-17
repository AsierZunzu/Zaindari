import { api } from './client'
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
    const formData = new FormData()
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
