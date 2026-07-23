import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import PlantCard from '../PlantCard.vue'
import { api } from '../../api/client'
import type { PlantWithImage } from '../../api/plants'
import { createTestI18n } from '../../test/i18n'

// Images are pulled through the api client so the request carries the
// Authorization header an <img> tag cannot; jsdom provides neither.
vi.mock('../../api/client', () => ({
  api: { getBlob: vi.fn() },
}))

const mockedApi = vi.mocked(api)

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/plants/:id', component: { template: '<div />' } },
  ],
})

function makePlant(overrides: Partial<PlantWithImage> = {}): PlantWithImage {
  return {
    id: '1',
    name: 'Monstera',
    location: 'Living room',
    instructions: null,
    ownerId: 'u1',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    currentImage: null,
    ...overrides,
  }
}

function mountCard(plant: PlantWithImage) {
  return mount(PlantCard, {
    props: { plant },
    global: { plugins: [router, createTestI18n()] },
  })
}

describe('PlantCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.getBlob.mockResolvedValue(new Blob(['bytes'], { type: 'image/webp' }))
    URL.createObjectURL = vi.fn().mockReturnValue('blob:fake-url')
    URL.revokeObjectURL = vi.fn()
  })

  it('renders the plant name', () => {
    const wrapper = mountCard(makePlant())
    expect(wrapper.text()).toContain('Monstera')
  })

  it('renders the plant location', () => {
    const wrapper = mountCard(makePlant({ location: 'Balcony' }))
    expect(wrapper.text()).toContain('Balcony')
  })

  it('shows placeholder when no image', () => {
    const wrapper = mountCard(makePlant({ currentImage: null }))
    // The emoji placeholder should be present (seedling emoji)
    expect(wrapper.text()).toContain('\u{1F331}')
  })

  it('shows image when plant has one', async () => {
    const plant = makePlant({
      currentImage: {
        id: 'img1',
        plantId: '1',
        filePath: '/uploads/img1.jpg',
        isCurrent: true,
        createdAt: '2025-01-01T00:00:00Z',
      },
    })
    const wrapper = mountCard(plant)
    await flushPromises()

    expect(mockedApi.getBlob).toHaveBeenCalledWith('/api/images/img1')

    const img = wrapper.find('img')
    expect(img.exists()).toBe(true)
    // The element gets the object URL, never the guarded endpoint -- pointing it
    // at /api/images/... directly is exactly the 401 this indirection avoids.
    expect(img.attributes('src')).toBe('blob:fake-url')
  })

  it('renders no img element when the image fetch fails', async () => {
    mockedApi.getBlob.mockRejectedValue(new Error('401'))
    const plant = makePlant({
      currentImage: {
        id: 'img1',
        plantId: '1',
        filePath: '/uploads/img1.jpg',
        isCurrent: true,
        createdAt: '2025-01-01T00:00:00Z',
      },
    })
    const wrapper = mountCard(plant)
    await flushPromises()

    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('links to the plant detail page', () => {
    const wrapper = mountCard(makePlant({ id: 'abc123' }))
    const link = wrapper.find('a')
    expect(link.attributes('href')).toBe('/plants/abc123')
  })
})
