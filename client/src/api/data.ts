import { api } from './client'

export type ImportMode = 'append' | 'replace'

export interface BundleManifest {
  app: string
  formatVersion: number
  exportedAt: string
  user: { username: string; displayName: string }
  counts: { plants: number; images: number }
  missingImages: string[]
}

export interface ImportPreview {
  manifest: BundleManifest
  plants: number
  images: number
  /** What the user stands to lose if they choose to replace. */
  existingPlants: number
}

/**
 * Something the import could not carry over.
 *
 * A descriptor, not a sentence: the server names what happened and the client
 * words it, exactly as it does for error codes. `useImportNotes` is the one
 * place that renders these, the same way `useTaskLabels` is for task
 * descriptors.
 */
export type ImportNote =
  | { kind: 'photosMissing'; plant: string; count: number }
  | { kind: 'photosUnreadable'; plant: string; count: number }
  | { kind: 'localeUnavailable'; locale: string }

export interface ImportSummary {
  mode: ImportMode
  plants: number
  images: number
  replacedPlants: number
  skipped: ImportNote[]
}

/** Must match FileInterceptor('bundle') in the server's data-transfer controller. */
const FIELD = 'bundle'

export const dataApi = {
  /**
   * Downloads the export.
   *
   * The endpoint is authenticated, so there is no URL a browser can be pointed
   * at directly -- the same constraint that makes `AuthedImage.vue` fetch blobs.
   * The bytes are read through the API client and handed to an object URL, and
   * the object URL is revoked immediately afterwards: a bundle is one of the
   * largest things this app holds, and leaking it keeps a whole garden's photos
   * alive in memory for as long as the tab is open.
   */
  async export(): Promise<string> {
    const { blob, filename } = await api.getFile('/api/data/export', 'zaindari-export.zip')

    const url = URL.createObjectURL(blob)
    try {
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.rel = 'noopener'
      document.body.appendChild(link)
      link.click()
      link.remove()
    } finally {
      URL.revokeObjectURL(url)
    }

    return filename
  },

  preview(file: File): Promise<ImportPreview> {
    const form = new FormData()
    form.append(FIELD, file)
    return api.postForm('/api/data/import/preview', form)
  },

  import(file: File, mode: ImportMode): Promise<ImportSummary> {
    const form = new FormData()
    form.append(FIELD, file)
    form.append('mode', mode)
    return api.postForm('/api/data/import', form)
  },
}
