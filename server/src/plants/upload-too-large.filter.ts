import {
  BadRequestException,
  Catch,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { MAX_IMAGE_MB } from './image-upload.options.js';

/**
 * Multer aborts an oversized upload with LIMIT_FILE_SIZE, which Nest's
 * transformException maps to 413 Payload Too Large. The upload endpoint's
 * contract is a 400 with an actionable message, so remap it here while keeping
 * multer's early-abort behaviour.
 */
@Catch(PayloadTooLargeException)
export class UploadTooLargeFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const body = new BadRequestException(
      `Image must be smaller than ${MAX_IMAGE_MB} MB`,
    ).getResponse();

    response.status(400).json(body);
  }
}
