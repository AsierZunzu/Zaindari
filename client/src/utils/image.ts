export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

export const MAX_IMAGE_MB = MAX_IMAGE_BYTES / (1024 * 1024)

/**
 * Mirrors the server-side upload limits in
 * server/src/plants/image-upload.options.ts. There is no shared package between
 * client and server, so the two have to be kept in step by hand -- the server
 * stays the authority, and this check exists only to fail fast and spare mobile
 * users a doomed multi-megabyte upload.
 *
 * Returns null when the file is acceptable, or the *same error code* the server
 * sends for that rejection. Sharing the code means the user sees an identical
 * sentence whether the file was caught here or upstream, and it only has to be
 * worded once per language.
 */
export interface ImageValidationError {
  code: string
  params?: Record<string, string | number>
}

export function validateImageFile(file: File): ImageValidationError | null {
  if (!file.type.startsWith('image/')) {
    return { code: 'plants.invalidImage' }
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return { code: 'plants.imageTooLarge', params: { mb: MAX_IMAGE_MB } }
  }

  return null
}
