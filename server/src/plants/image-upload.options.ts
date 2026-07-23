import { BadRequestException } from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface.js';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const MAX_IMAGE_MB = MAX_IMAGE_BYTES / (1024 * 1024);

/**
 * Multer config for plant photo uploads.
 *
 * `limits.fileSize` is the memory guard: multer aborts the stream once the cap
 * is passed, so an oversized upload never gets fully buffered. This is why the
 * cap lives here rather than in a ParseFilePipe validator, which would only run
 * after the whole file was already in memory.
 *
 * `fileFilter` rejects non-images before any bytes are buffered. Client-supplied
 * mimetypes are trivially spoofed, so this is a resource guard, not a security
 * boundary -- sharp's decode in ImagesService is the real validation.
 */
export const imageUploadOptions: MulterOptions = {
  limits: {
    fileSize: MAX_IMAGE_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype?.startsWith('image/')) {
      // transformException passes HttpExceptions through untouched, so this
      // surfaces as a 400 rather than being remapped to a 500.
      cb(new BadRequestException('Only image files can be uploaded'), false);
      return;
    }
    cb(null, true);
  },
};
