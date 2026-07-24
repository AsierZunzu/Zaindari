import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import DataTransfer from '../DataTransfer.vue'
import { createTestI18n } from '../../test/i18n'
import { dataApi } from '../../api/data'
import { ApiError, NetworkError } from '../../api/client'
import { purgeApiCache } from '../../sw-cache-key'

vi.mock('../../api/data', () => ({
  dataApi: {
    export: vi.fn(),
    preview: vi.fn(),
    import: vi.fn(),
  },
}))

vi.mock('../../sw-cache-key', () => ({
  purgeApiCache: vi.fn().mockResolvedValue(undefined),
}))

const previewFixture = {
  manifest: {
    app: 'zaindari',
    formatVersion: 1,
    exportedAt: '2026-03-12T10:00:00.000Z',
    user: { username: 'asier', displayName: 'Asier' },
    counts: { plants: 3, images: 5 },
    missingImages: [],
  },
  plants: 3,
  images: 5,
  existingPlants: 14,
}

function mountComponent() {
  return mount(DataTransfer, { global: { plugins: [createTestI18n()] } })
}

async function pickFile(wrapper: ReturnType<typeof mount>) {
  const input = wrapper.find('input[type="file"]')
  Object.defineProperty(input.element, 'files', {
    value: [new File(['zip'], 'backup.zip', { type: 'application/zip' })],
    configurable: true,
  })
  await input.trigger('change')
  await flushPromises()
}

/** The confirm-and-import sequence, which a replace needs in full. */
async function chooseReplace(wrapper: ReturnType<typeof mount>) {
  await wrapper.findAll('input[type="radio"]')[1].setValue()
  await wrapper.find('input[type="checkbox"]').setValue(true)
}

const importButton = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAll('button').find((b) => /Import/.test(b.text()))!

describe('DataTransfer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    vi.mocked(dataApi.preview).mockResolvedValue(previewFixture)
    vi.mocked(dataApi.import).mockResolvedValue({
      mode: 'append',
      plants: 3,
      images: 5,
      replacedPlants: 0,
      skipped: [],
    })
  })

  describe('export', () => {
    it('names the file it downloaded', async () => {
      vi.mocked(dataApi.export).mockResolvedValue('zaindari-asier-2026-07-24.zip')
      const wrapper = mountComponent()

      await wrapper.findAll('button')[0].trigger('click')
      await flushPromises()

      expect(dataApi.export).toHaveBeenCalledOnce()
      expect(wrapper.text()).toContain('Downloaded zaindari-asier-2026-07-24.zip')
    })

    it('reports a failure in the user\'s language, not the server\'s', async () => {
      vi.mocked(dataApi.export).mockRejectedValue(
        new ApiError(400, 'Invalid backup file', 'data.bundleInvalid'),
      )
      const wrapper = mountComponent()

      await wrapper.findAll('button')[0].trigger('click')
      await flushPromises()

      expect(wrapper.text()).toContain('not a Zaindari backup')
      expect(wrapper.text()).not.toContain('Invalid backup file')
    })

    it('distinguishes an unreachable server from a rejected export', async () => {
      vi.mocked(dataApi.export).mockRejectedValue(new NetworkError())
      const wrapper = mountComponent()

      await wrapper.findAll('button')[0].trigger('click')
      await flushPromises()

      expect(wrapper.text()).toContain('Could not reach the server')
    })
  })

  describe('preview', () => {
    // Reading the file on selection is what lets the user see what they are
    // about to do before they commit to it.
    it('reads the file as soon as it is picked', async () => {
      const wrapper = mountComponent()
      await pickFile(wrapper)

      expect(dataApi.preview).toHaveBeenCalledOnce()
      expect(dataApi.import).not.toHaveBeenCalled()
      // With the year, so a months-old backup is not confused for a recent one.
      expect(wrapper.text()).toContain('Exported by Asier on Mar 12, 2026')
      expect(wrapper.text()).toContain('3')
      expect(wrapper.text()).toContain('5')
    })

    it('reports an unreadable file and offers no import', async () => {
      vi.mocked(dataApi.preview).mockRejectedValue(
        new ApiError(400, 'Not a readable zip file', 'data.bundleInvalid'),
      )
      const wrapper = mountComponent()
      await pickFile(wrapper)

      expect(wrapper.text()).toContain('not a Zaindari backup')
      expect(importButton(wrapper)).toBeUndefined()
    })

    it('explains a bundle from a newer server', async () => {
      vi.mocked(dataApi.preview).mockRejectedValue(
        new ApiError(400, 'too new', 'data.bundleVersionUnsupported', {
          version: 2,
          supported: 1,
        }),
      )
      const wrapper = mountComponent()
      await pickFile(wrapper)

      expect(wrapper.text()).toContain('format 2')
      expect(wrapper.text()).toContain('this server reads 1')
    })
  })

  describe('choosing a mode', () => {
    it('appends without extra confirmation', async () => {
      const wrapper = mountComponent()
      await pickFile(wrapper)

      expect(importButton(wrapper).attributes('disabled')).toBeUndefined()

      await importButton(wrapper).trigger('click')
      await flushPromises()

      expect(dataApi.import).toHaveBeenCalledWith(expect.any(File), 'append')
    })

    // "Delete everything" is abstract; "delete your 14 plants" is a decision
    // someone can actually make.
    it('names how many plants a replace would destroy', async () => {
      const wrapper = mountComponent()
      await pickFile(wrapper)
      await wrapper.findAll('input[type="radio"]')[1].setValue()

      expect(wrapper.text()).toContain('permanently delete your 14 existing plants')
    })

    it('refuses to replace until the warning is acknowledged', async () => {
      const wrapper = mountComponent()
      await pickFile(wrapper)
      await wrapper.findAll('input[type="radio"]')[1].setValue()

      expect(importButton(wrapper).attributes('disabled')).toBeDefined()

      await importButton(wrapper).trigger('click')
      await flushPromises()
      expect(dataApi.import).not.toHaveBeenCalled()

      await wrapper.find('input[type="checkbox"]').setValue(true)
      expect(importButton(wrapper).attributes('disabled')).toBeUndefined()
    })

    // Switching back to append must not carry a stale acknowledgement forward
    // into a later replace.
    it('drops the acknowledgement when the file is cleared', async () => {
      const wrapper = mountComponent()
      await pickFile(wrapper)
      await chooseReplace(wrapper)

      await wrapper.findAll('button').find((b) => b.text() === 'Cancel')!.trigger('click')
      await pickFile(wrapper)
      await wrapper.findAll('input[type="radio"]')[1].setValue()

      expect(importButton(wrapper).attributes('disabled')).toBeDefined()
    })

    it('sends replace once acknowledged', async () => {
      const wrapper = mountComponent()
      await pickFile(wrapper)
      await chooseReplace(wrapper)
      await importButton(wrapper).trigger('click')
      await flushPromises()

      expect(dataApi.import).toHaveBeenCalledWith(expect.any(File), 'replace')
    })
  })

  describe('after importing', () => {
    it('reports what was brought in', async () => {
      const wrapper = mountComponent()
      await pickFile(wrapper)
      await importButton(wrapper).trigger('click')
      await flushPromises()

      expect(wrapper.text()).toContain('Import complete')
    })

    // The service worker holds the pre-import plant list under a NetworkFirst
    // cache; leaving it would show the old garden on the next offline open.
    it('clears the cached API responses', async () => {
      const wrapper = mountComponent()
      await pickFile(wrapper)
      await importButton(wrapper).trigger('click')
      await flushPromises()

      expect(purgeApiCache).toHaveBeenCalledOnce()
    })

    it('words the notes about what did not make it', async () => {
      vi.mocked(dataApi.import).mockResolvedValue({
        mode: 'append',
        plants: 2,
        images: 1,
        replacedPlants: 0,
        skipped: [
          { kind: 'photosMissing', plant: 'Monstera', count: 1 },
          { kind: 'photosUnreadable', plant: 'Fern', count: 3 },
          { kind: 'localeUnavailable', locale: 'kli' },
        ],
      })

      const wrapper = mountComponent()
      await pickFile(wrapper)
      await importButton(wrapper).trigger('click')
      await flushPromises()

      // Singular and plural forms both come from the catalog: "1 photo was"
      // versus "3 photos could" is a rule English and Basque disagree on.
      expect(wrapper.text()).toContain('Monstera: 1 photo was not in the file')
      expect(wrapper.text()).toContain('Fern: 3 photos could not be read')
      expect(wrapper.text()).toContain('“kli” is not available here')
    })

    it('keeps the file on screen when the import fails', async () => {
      vi.mocked(dataApi.import).mockRejectedValue(
        new ApiError(400, 'nope', 'data.bundleInvalid'),
      )

      const wrapper = mountComponent()
      await pickFile(wrapper)
      await importButton(wrapper).trigger('click')
      await flushPromises()

      expect(wrapper.text()).toContain('not a Zaindari backup')
      // Still offered, so a retry does not mean picking the file again.
      expect(importButton(wrapper)).toBeDefined()
    })
  })
})
