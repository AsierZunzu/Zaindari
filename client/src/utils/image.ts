export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

export const MAX_IMAGE_MB = MAX_IMAGE_BYTES / (1024 * 1024)

/**
 * Mirrors the server-side upload limits in
 * server/src/plants/image-upload.options.ts. There is no shared package between
 * client and server, so the two have to be kept in step by hand -- the server
 * stays the authority, and this check exists only to fail fast and spare mobile
 * users a doomed multi-megabyte upload.
 *
 * Returns an error message, or null when the file is acceptable.
 */
export function validateImageFile(file: File): string | null {
  if (!file.type.startsWith('image/')) {
    return 'Only image files can be uploaded'
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return `Image must be smaller than ${MAX_IMAGE_MB} MB`
  }

  return null
}
