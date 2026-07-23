import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ImageUpload from '../ImageUpload.vue'
import { MAX_IMAGE_BYTES } from '../../utils/image'

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
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:preview')
  })

  it('emits file-selected for an image within the size cap', async () => {
    const wrapper = mount(ImageUpload)
    await selectFile(wrapper, fileOfSize(2 * 1024 * 1024))

    expect(wrapper.emitted('file-selected')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('smaller than')
  })

  it('rejects a file over the cap without emitting', async () => {
    const wrapper = mount(ImageUpload)
    await selectFile(wrapper, fileOfSize(MAX_IMAGE_BYTES + 1))

    expect(wrapper.emitted('file-selected')).toBeUndefined()
    expect(wrapper.text()).toContain('Image must be smaller than 10 MB')
  })

  it('rejects a non-image without emitting', async () => {
    const wrapper = mount(ImageUpload)
    await selectFile(wrapper, fileOfSize(1024, 'application/pdf', 'notes.pdf'))

    expect(wrapper.emitted('file-selected')).toBeUndefined()
    expect(wrapper.text()).toContain('Only image files can be uploaded')
  })

  it('keeps an already-selected file when a later pick is invalid', async () => {
    const wrapper = mount(ImageUpload)
    await selectFile(wrapper, fileOfSize(1024 * 1024))
    await selectFile(wrapper, fileOfSize(MAX_IMAGE_BYTES + 1))

    expect(wrapper.emitted('file-selected')).toHaveLength(1)
    expect(wrapper.find('img').exists()).toBe(true)
  })

  it('clears the error once a valid file is chosen', async () => {
    const wrapper = mount(ImageUpload)
    await selectFile(wrapper, fileOfSize(MAX_IMAGE_BYTES + 1))
    expect(wrapper.text()).toContain('Image must be smaller than 10 MB')

    await selectFile(wrapper, fileOfSize(1024))

    expect(wrapper.text()).not.toContain('Image must be smaller than 10 MB')
    expect(wrapper.emitted('file-selected')).toHaveLength(1)
  })
})
