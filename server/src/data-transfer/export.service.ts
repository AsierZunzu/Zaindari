import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ZipFile } from 'yazl';
import * as fs from 'fs';
import * as path from 'path';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { apiError, ERROR_CODES } from '../common/errors/api-error.js';
import {
  BUNDLE_FORMAT_VERSION,
  DATA_ENTRY,
  MANIFEST_ENTRY,
  imageEntryName,
  type BundleData,
  type BundleManifest,
  type BundlePlant,
} from './bundle.js';

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Everything the user owns, as a zip streamed straight to the response.
   *
   * Scoped by `ownerId`, deliberately not by the owner-or-shared rule that
   * `PlantsService.findAllForUser` applies. A share is a permission to help care
   * for someone else's plant, not a claim on its data: it cannot be recreated on
   * another instance (the collaborator's account does not exist there), and
   * exporting it would hand a full photo history to whoever it was shared with.
   *
   * This is the same class of endpoint as `ImagesService.serve` -- no `:id`
   * param means `PlantAccessGuard` cannot cover it, so the access rule is
   * written out here instead.
   */
  async streamForUser(userId: string, res: Response) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
        displayName: true,
        locale: true,
        notificationHour: true,
        notificationMinute: true,
        notificationTimes: {
          select: { taskType: true, hour: true, minute: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(
        apiError(ERROR_CODES.bundleInvalid, 'User not found'),
      );
    }

    const plants = await this.prisma.plant.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'asc' },
      include: {
        schedules: {
          select: {
            taskType: true,
            intervalDays: true,
            hour: true,
            minute: true,
            enabled: true,
          },
        },
        images: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            filePath: true,
            isCurrent: true,
            createdAt: true,
          },
        },
      },
    });

    // Resolved before anything is written, because the manifest reports which
    // photos were missing and the manifest is the first entry in the archive.
    const files: Array<{ entry: string; absolutePath: string }> = [];
    const missingImages: string[] = [];

    for (const plant of plants) {
      for (const image of plant.images) {
        const absolutePath = path.join(process.cwd(), image.filePath);
        if (fs.existsSync(absolutePath)) {
          files.push({ entry: imageEntryName(image.id), absolutePath });
        } else {
          // One lost file must not make a whole garden unexportable; the row is
          // still described in data.json and import skips it.
          missingImages.push(image.id);
        }
      }
    }

    const data: BundleData = {
      user: {
        locale: user.locale,
        notificationHour: user.notificationHour,
        notificationMinute: user.notificationMinute,
        notificationTimes: user.notificationTimes.map((time) => ({
          taskType: time.taskType,
          hour: time.hour,
          minute: time.minute,
        })),
      },
      plants: plants.map((plant): BundlePlant => ({
        name: plant.name,
        location: plant.location,
        instructions: plant.instructions,
        createdAt: plant.createdAt.toISOString(),
        schedules: plant.schedules.map((schedule) => ({
          taskType: schedule.taskType,
          intervalDays: schedule.intervalDays,
          hour: schedule.hour,
          minute: schedule.minute,
          enabled: schedule.enabled,
        })),
        images: plant.images.map((image) => ({
          id: image.id,
          isCurrent: image.isCurrent,
          createdAt: image.createdAt.toISOString(),
        })),
      })),
    };

    const manifest: BundleManifest = {
      app: 'zaindari',
      formatVersion: BUNDLE_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      user: { username: user.username, displayName: user.displayName },
      counts: { plants: plants.length, images: files.length },
      missingImages,
    };

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      contentDisposition(exportFilename(user.username, manifest.exportedAt)),
    );

    const zip = new ZipFile();

    // By the time an entry fails the response is already streaming, so there is
    // no status code left to change -- the connection is destroyed instead, so
    // the client sees a truncated download rather than a valid short archive it
    // would happily treat as a complete backup.
    zip.outputStream.on('error', (err: Error) => {
      this.logger.error(`Export failed for user ${userId}: ${err.message}`);
      res.destroy(err);
    });

    zip.outputStream.pipe(res);

    zip.addBuffer(
      Buffer.from(JSON.stringify(manifest, null, 2)),
      MANIFEST_ENTRY,
    );
    zip.addBuffer(Buffer.from(JSON.stringify(data, null, 2)), DATA_ENTRY);

    for (const file of files) {
      // Photos are already WebP, so deflating them again costs CPU to save
      // almost nothing; the two JSON entries above are left compressed.
      zip.addFile(file.absolutePath, file.entry, { compress: false });
    }

    zip.end();

    // The response is driven by the pipe above; resolving here only reports
    // that the archive was fully handed off.
    await new Promise<void>((resolve) => {
      res.on('finish', resolve);
      res.on('close', resolve);
    });
  }
}

/**
 * A filename is only ever a convenience for the person downloading, so the
 * username is reduced to characters that survive every filesystem and header
 * encoding rather than being escaped. An empty result still yields a usable
 * name because the prefix and date carry it.
 */
export function exportFilename(username: string, exportedAt: string): string {
  const safeUser = username
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const date = exportedAt.slice(0, 10);

  return ['zaindari', safeUser, date].filter(Boolean).join('-') + '.zip';
}

/** `filename` is already ASCII-safe by construction, so no RFC 5987 twin. */
function contentDisposition(filename: string): string {
  return `attachment; filename="${filename}"`;
}
