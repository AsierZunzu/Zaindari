import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ImageUpload from '../ImageUpload.vue'
import { api } from '../../api/client'
import { MAX_IMAGE_BYTES } from '../../utils/image'
import { createTestI18n } from '../../test/i18n'

// The stored photo is pulled through the api client so the request carries the
// Authorization header an <img> tag cannot; jsdom provides neither.
vi.mock('../../api/client', () => ({
  api: { getBlob: vi.fn() },
}))

const mockedApi = vi.mocked(api)

function fileOfSize(bytes: number, type = 'image/jpeg', name = 'photo.jpg') {
  const file = new File(['x'], name, { type })
  // Constructing a genuinely 10 MB File in jsdom is wasteful, and File.size is
  // read-only, so report the size we want to exercise.
  Object.defineProperty(file, 'size', { value: bytes })
  return file
}

async function selectFile(wrapper: ReturnType<typeof mount>, file: File) {
  const input = wrapper.find('input[type="file"]')
  Object.defineProperty(input.element, 'files', {
    value: [file],
    configurable: true,
  })
  await input.trigger('change')
}

describe('ImageUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.URL.createObjectURL = vi.fn((source: Blob | MediaSource) =>
      source instanceof File ? 'blob:picked' : 'blob:stored',
    )
    globalThis.URL.revokeObjectURL = vi.fn()
    mockedApi.getBlob.mockResolvedValue(new Blob(['x']))
  })

  it('emits file-selected for an image within the size cap', async () => {
    const wrapper = mount(ImageUpload, { global: { plugins: [createTestI18n()] } })
    await selectFile(wrapper, fileOfSize(2 * 1024 * 1024))

    expect(wrapper.emitted('file-selected')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('smaller than')
  })

  it('rejects a file over the cap without emitting', async () => {
    const wrapper = mount(ImageUpload, { global: { plugins: [createTestI18n()] } })
    await selectFile(wrapper, fileOfSize(MAX_IMAGE_BYTES + 1))

    expect(wrapper.emitted('file-selected')).toBeUndefined()
    expect(wrapper.text()).toContain('Image must be smaller than 10 MB')
  })

  it('rejects a non-image without emitting', async () => {
    const wrapper = mount(ImageUpload, { global: { plugins: [createTestI18n()] } })
    await selectFile(wrapper, fileOfSize(1024, 'application/pdf', 'notes.pdf'))

    expect(wrapper.emitted('file-selected')).toBeUndefined()
    expect(wrapper.text()).toContain('Only image files can be uploaded')
  })

  it('keeps an already-selected file when a later pick is invalid', async () => {
    const wrapper = mount(ImageUpload, { global: { plugins: [createTestI18n()] } })
    await selectFile(wrapper, fileOfSize(1024 * 1024))
    await selectFile(wrapper, fileOfSize(MAX_IMAGE_BYTES + 1))

    expect(wrapper.emitted('file-selected')).toHaveLength(1)
    expect(wrapper.find('img').exists()).toBe(true)
  })

  it('clears the error once a valid file is chosen', async () => {
    const wrapper = mount(ImageUpload, { global: { plugins: [createTestI18n()] } })
    await selectFile(wrapper, fileOfSize(MAX_IMAGE_BYTES + 1))
    expect(wrapper.text()).toContain('Image must be smaller than 10 MB')

    await selectFile(wrapper, fileOfSize(1024))

    expect(wrapper.text()).not.toContain('Image must be smaller than 10 MB')
    expect(wrapper.emitted('file-selected')).toHaveLength(1)
  })

  it('previews an existing photo through the authenticated endpoint', async () => {
    const wrapper = mount(ImageUpload, {
      props: { currentImageUrl: '/api/images/img-1' },
      global: { plugins: [createTestI18n()] },
    })
    await flushPromises()

    expect(mockedApi.getBlob).toHaveBeenCalledWith('/api/images/img-1')
    expect(wrapper.find('img').attributes('src')).toBe('blob:stored')
  })

  it('shows the empty state rather than a broken image when the photo cannot be read', async () => {
    mockedApi.getBlob.mockRejectedValue(new Error('401'))
    const wrapper = mount(ImageUpload, {
      props: { currentImageUrl: '/api/images/img-1' },
      global: { plugins: [createTestI18n()] },
    })
    await flushPromises()

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain('Tap to add a photo')
  })

  it('lets a newly picked file replace the existing photo in the preview', async () => {
    const wrapper = mount(ImageUpload, {
      props: { currentImageUrl: '/api/images/img-1' },
      global: { plugins: [createTestI18n()] },
    })
    await flushPromises()
    await selectFile(wrapper, fileOfSize(1024))

    expect(wrapper.find('img').attributes('src')).toBe('blob:picked')
  })

  it('revokes a superseded pick instead of leaking its blob', async () => {
    const wrapper = mount(ImageUpload, { global: { plugins: [createTestI18n()] } })
    await selectFile(wrapper, fileOfSize(1024))
    await selectFile(wrapper, fileOfSize(2048))

    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith('blob:picked')
  })
})
