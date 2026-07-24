import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface.js';

export const MAX_BUNDLE_BYTES = 200 * 1024 * 1024;

export const MAX_BUNDLE_MB = MAX_BUNDLE_BYTES / (1024 * 1024);

/**
 * Multer config for an uploaded backup.
 *
 * As with `image-upload.options.ts`, `limits.fileSize` is the memory guard and
 * has to live here: multer aborts the stream once the cap is passed, so an
 * oversized upload is never fully buffered. A ParseFilePipe validator would run
 * only after the whole file was already in memory, which for a 200 MB cap is
 * the entire problem.
 *
 * The cap is generous because a bundle is a whole garden's photo history at up
 * to 1200px each -- the number to keep an eye on is not one plant but a few
 * hundred images. There is no `fileFilter` twin of the image one: a zip's
 * mimetype arrives as anything from application/zip to
 * application/x-zip-compressed to octet-stream depending on the browser, so
 * filtering on it would reject real uploads while stopping nothing. yauzl
 * failing to find a central directory is the real check, exactly as sharp's
 * decode is for images.
 */
export const importUploadOptions: MulterOptions = {
  limits: {
    fileSize: MAX_BUNDLE_BYTES,
    files: 1,
  },
};
