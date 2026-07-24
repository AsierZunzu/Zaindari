import {
  BadRequestException,
  Catch,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { MAX_BUNDLE_MB } from './import-upload.options.js';
import { apiError, ERROR_CODES } from '../common/errors/api-error.js';

/**
 * The bundle-sized twin of `plants/upload-too-large.filter.ts`: multer aborts an
 * oversized upload with LIMIT_FILE_SIZE, Nest's transformException maps that to
 * 413, and this endpoint's contract is a 400 carrying a code the client can
 * translate. Separate from the image filter because the two limits differ by
 * more than an order of magnitude and the sentence quotes the number.
 */
@Catch(PayloadTooLargeException)
export class BundleTooLargeFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const body = new BadRequestException(
      apiError(
        ERROR_CODES.bundleTooLarge,
        `Backup must be smaller than ${MAX_BUNDLE_MB} MB`,
        { mb: MAX_BUNDLE_MB },
      ),
    ).getResponse();

    response.status(400).json(body);
  }
}
