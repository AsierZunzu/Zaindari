import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import PlantCard from '../PlantCard.vue'
import type { PlantWithImage } from '../../api/plants'

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
    global: { plugins: [router] },
  })
}

describe('PlantCard', () => {
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

  it('shows image when plant has one', () => {
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
    const img = wrapper.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('/api/images/img1')
  })

  it('links to the plant detail page', () => {
    const wrapper = mountCard(makePlant({ id: 'abc123' }))
    const link = wrapper.find('a')
    expect(link.attributes('href')).toBe('/plants/abc123')
  })
})
