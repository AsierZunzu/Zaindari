import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Res,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { apiError, ERROR_CODES } from '../common/errors/api-error.js';
import { ExportService } from './export.service.js';
import { ImportService, type ImportMode } from './import.service.js';
import { importUploadOptions } from './import-upload.options.js';
import { BundleTooLargeFilter } from './bundle-too-large.filter.js';

/**
 * Mounted at `/api/data` rather than under `/api/me`, which is where a
 * per-user endpoint would otherwise belong.
 *
 * The service worker matches `/api/me` as an *exact* path for NetworkOnly, so
 * anything below it (`/api/me/export`) falls through to the NetworkFirst rule
 * -- which would put a multi-megabyte zip into the runtime API cache, evicting
 * real responses from a 50-entry budget to store something nobody will ever
 * replay. `/api/data/*` gets its own NetworkOnly registration in `sw.ts`.
 */
@Controller('api/data')
@UseGuards(JwtAuthGuard)
export class DataTransferController {
  constructor(
    private readonly exportService: ExportService,
    private readonly importService: ImportService,
  ) {}

  /**
   * Streams the archive itself rather than a link to it. There is no
   * unauthenticated URL to hand a browser: like `GET /api/images/:imageId`, this
   * is only reachable with a bearer token, so the client reads it as a blob and
   * hands the download to an object URL.
   */
  @Get('export')
  async export(@CurrentUser() user: { id: string }, @Res() res: Response) {
    await this.exportService.streamForUser(user.id, res);
  }

  /** Reads the bundle and reports what it holds, without writing anything. */
  @Post('import/preview')
  @UseFilters(BundleTooLargeFilter)
  @UseInterceptors(FileInterceptor('bundle', importUploadOptions))
  async previewImport(
    @CurrentUser() user: { id: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.importService.preview(user.id, requireBundle(file));
  }

  @Post('import')
  @UseFilters(BundleTooLargeFilter)
  @UseInterceptors(FileInterceptor('bundle', importUploadOptions))
  async import(
    @CurrentUser() user: { id: string },
    @UploadedFile() file: Express.Multer.File,
    @Body('mode') mode?: string,
  ) {
    // A multipart field arrives as a string, so this cannot be a DTO with a
    // validated enum without a transform. Defaulting to `append` keeps the
    // destructive path opt-in: a request that forgot the field, or one built by
    // hand, must never delete the caller's garden by accident.
    const resolved: ImportMode = mode === 'replace' ? 'replace' : 'append';

    return this.importService.import(user.id, requireBundle(file), resolved);
  }
}

function requireBundle(file: Express.Multer.File | undefined): Buffer {
  if (!file?.buffer) {
    throw new BadRequestException(
      apiError(ERROR_CODES.noBundleUploaded, 'No backup file was uploaded'),
    );
  }
  return file.buffer;
}
