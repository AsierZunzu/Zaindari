import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import yauzl from 'yauzl';
import { PrismaService } from '../prisma/prisma.service.js';
import { SchedulerService } from '../tasks/scheduler.service.js';
import { apiError, ERROR_CODES } from '../common/errors/api-error.js';
import { isSupportedLocale } from '../i18n/messages.js';
import { MAX_IMAGE_BYTES } from '../plants/image-upload.options.js';
import {
  DATA_ENTRY,
  MANIFEST_ENTRY,
  parseBundleData,
  parseImageEntry,
  parseJsonEntry,
  parseManifest,
  type BundleData,
  type BundleManifest,
} from './bundle.js';

export type ImportMode = 'append' | 'replace';

export interface ImportPreview {
  manifest: BundleManifest;
  plants: number;
  images: number;
  /** What the user stands to lose if they pick `replace`. */
  existingPlants: number;
}

/**
 * Something the import could not carry over, as a descriptor rather than a
 * sentence.
 *
 * The server words exactly one thing in this app -- push bodies -- because
 * those are the only strings the client never gets to render. Everything else
 * travels as a code the client turns into a sentence in the user's own
 * language, and a result screen is no exception. Counts are aggregated per
 * plant so that a bundle missing three hundred photos reports one line rather
 * than three hundred.
 */
export type ImportNote =
  | { kind: 'photosMissing'; plant: string; count: number }
  | { kind: 'photosUnreadable'; plant: string; count: number }
  | { kind: 'localeUnavailable'; locale: string };

export interface ImportSummary {
  mode: ImportMode;
  plants: number;
  images: number;
  replacedPlants: number;
  skipped: ImportNote[];
}

interface BundleContents {
  manifest: BundleManifest;
  data: BundleData;
  images: Map<string, Buffer>;
}

/**
 * Total uncompressed bytes a bundle may expand to.
 *
 * The upload cap in `import-upload.options.ts` bounds the *compressed* file, and
 * a zip of a few hundred KB can expand to gigabytes. Every entry is counted
 * against this as it is read, so a bomb is abandoned partway through rather
 * than after it has filled memory.
 */
const MAX_UNCOMPRESSED_BYTES = 600 * 1024 * 1024;

/** data.json is text; anything near this is not a garden. */
const MAX_JSON_BYTES = 32 * 1024 * 1024;

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: SchedulerService,
  ) {}

  async preview(userId: string, file: Buffer): Promise<ImportPreview> {
    const { manifest, data, images } = await this.readBundle(file);

    return {
      manifest,
      plants: data.plants.length,
      images: data.plants.reduce(
        (total, plant) =>
          total + plant.images.filter((image) => images.has(image.id)).length,
        0,
      ),
      existingPlants: await this.prisma.plant.count({
        where: { ownerId: userId },
      }),
    };
  }

  /**
   * Restores a bundle into `userId`'s account.
   *
   * Nothing from the file is restored under its original id. Plants and photos
   * are created with fresh UUIDs and the owner is always the importing user, so
   * a bundle cannot be used to write into someone else's account, resurrect a
   * deleted row, or collide with an id already in the database.
   *
   * The ordering below is what makes a failure survivable. Photos are decoded
   * and written to disk *before* the transaction opens, because re-encoding a
   * few hundred images through sharp would blow any sane transaction timeout;
   * the database work is then a single short transaction over pre-computed
   * rows. If it rolls back, the files written in the previous step are the only
   * mess left, and they are cleaned up explicitly -- the reverse (rows without
   * files) would leave broken photos in the UI with no way to find them.
   */
  async import(
    userId: string,
    file: Buffer,
    mode: ImportMode,
  ): Promise<ImportSummary> {
    const { data, images } = await this.readBundle(file);
    const skipped: ImportNote[] = [];

    // Fresh ids for everything, generated up front so each photo's path on disk
    // is known before any of it is written.
    const plans = data.plants.map((plant) => {
      const present = plant.images.filter((image) => images.has(image.id));

      // Expected for anything the manifest listed under missingImages, and the
      // reason a lost file does not make a bundle unimportable.
      const missing = plant.images.length - present.length;
      if (missing > 0) {
        skipped.push({
          kind: 'photosMissing',
          plant: plant.name,
          count: missing,
        });
      }

      return {
        id: randomUUID(),
        source: plant,
        images: present.map((image) => ({ ...image, newId: randomUUID() })),
      };
    });

    const written: string[] = [];
    let imageRows: Array<{
      id: string;
      plantId: string;
      filePath: string;
      isCurrent: boolean;
      createdAt: Date;
    }> = [];

    try {
      imageRows = await this.writeImages(plans, images, written, skipped);
    } catch (err) {
      cleanupFiles(written);
      throw err;
    }

    const existing = await this.prisma.plant.findMany({
      where: { ownerId: userId },
      select: { id: true },
    });
    const toReplace = mode === 'replace' ? existing.map((p) => p.id) : [];

    try {
      await this.prisma.$transaction(
        async (tx) => {
          if (toReplace.length > 0) {
            // Cascades take plant_shares, plant_images, plant_schedules and
            // tasks with them; the photo directories are removed after the
            // commit, so a rollback cannot lose files that still have rows.
            await tx.plant.deleteMany({ where: { id: { in: toReplace } } });
          }

          // Settings are restored on a replace only. "Replace" means restore
          // this backup, so the locale and reminder times come with it;
          // "append" means take these plants into the account I already have,
          // where silently rewriting the language would be a surprise.
          if (mode === 'replace') {
            await this.restoreSettings(tx, userId, data, skipped);
          }

          await tx.plant.createMany({
            data: plans.map((plan) => ({
              id: plan.id,
              ownerId: userId,
              name: plan.source.name,
              location: plan.source.location,
              instructions: plan.source.instructions,
              createdAt: new Date(plan.source.createdAt),
            })),
          });

          const schedules = plans.flatMap((plan) =>
            plan.source.schedules.map((schedule) => ({
              plantId: plan.id,
              taskType: schedule.taskType,
              intervalDays: schedule.intervalDays,
              hour: schedule.hour,
              minute: schedule.minute,
              enabled: schedule.enabled,
            })),
          );
          if (schedules.length > 0) {
            await tx.plantSchedule.createMany({ data: schedules });
          }

          if (imageRows.length > 0) {
            await tx.plantImage.createMany({ data: imageRows });
          }
        },
        // createMany keeps this to a handful of statements, but a few hundred
        // plants still deserve more than Prisma's 5s default.
        { timeout: 120_000, maxWait: 15_000 },
      );
    } catch (err) {
      cleanupFiles(written);
      this.logger.error(`Import failed for user ${userId}: ${String(err)}`);
      // Not `bundleInvalid`: by this point the file has parsed and every value
      // in it has been validated, so a failure here is the database's problem,
      // not the user's. Telling them their backup is damaged would send them
      // off to re-export a file that was fine.
      throw new InternalServerErrorException(
        apiError(ERROR_CODES.importFailed, 'Could not import this backup'),
      );
    }

    // Only now that the rows are gone for good.
    for (const plantId of toReplace) {
      const dir = path.join(process.cwd(), 'uploads', plantId);
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }

    // Seed the first task for every plant we just created, so a freshly
    // imported garden has its schedule running immediately rather than after
    // the next cron tick. Non-fatal: the import has already committed real
    // rows, and the @Cron('* * * * *') tick seeds anything this misses within
    // the minute. Failing here would report a good backup as broken.
    try {
      await this.scheduler.seedTasksForPlants(plans.map((plan) => plan.id));
    } catch (err) {
      this.logger.warn(`Post-import task seeding failed: ${String(err)}`);
    }

    return {
      mode,
      plants: plans.length,
      images: imageRows.length,
      replacedPlants: toReplace.length,
      skipped,
    };
  }

  /**
   * Re-encodes every photo through sharp on the way in.
   *
   * The bundle's bytes are never trusted and never copied verbatim, even though
   * an export writes only WebP: the `.webp` in an entry name is a claim, not a
   * fact, and this is the same reasoning that makes `ImagesService.upload` treat
   * sharp's decode as the real validation for a browser upload. A file sharp
   * cannot decode is skipped rather than fatal -- one corrupt photo should not
   * cost the user the other three hundred.
   */
  private async writeImages(
    plans: Array<{
      id: string;
      source: { name: string };
      images: Array<{
        id: string;
        newId: string;
        isCurrent: boolean;
        createdAt: string;
      }>;
    }>,
    images: Map<string, Buffer>,
    written: string[],
    skipped: ImportNote[],
  ) {
    const rows: Array<{
      id: string;
      plantId: string;
      filePath: string;
      isCurrent: boolean;
      createdAt: Date;
    }> = [];

    for (const plan of plans) {
      let unreadable = 0;

      for (const image of plan.images) {
        const buffer = images.get(image.id);
        if (!buffer) continue;

        const relativeDir = path.join('uploads', plan.id);
        const absoluteDir = path.join(process.cwd(), relativeDir);
        const filename = `${image.newId}.webp`;
        const absolutePath = path.join(absoluteDir, filename);

        try {
          if (!fs.existsSync(absoluteDir)) {
            fs.mkdirSync(absoluteDir, { recursive: true });
          }

          await sharp(buffer)
            .rotate()
            .resize({ width: 1200, withoutEnlargement: true })
            .webp()
            .toFile(absolutePath);
        } catch {
          unreadable += 1;
          continue;
        }

        written.push(absolutePath);
        rows.push({
          id: image.newId,
          plantId: plan.id,
          filePath: path.join(relativeDir, filename),
          isCurrent: image.isCurrent,
          createdAt: new Date(image.createdAt),
        });
      }

      if (unreadable > 0) {
        skipped.push({
          kind: 'photosUnreadable',
          plant: plan.source.name,
          count: unreadable,
        });
      }
    }

    return rows;
  }

  private async restoreSettings(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    userId: string,
    data: BundleData,
    skipped: ImportNote[],
  ) {
    // A locale this build does not ship would be echoed into `<html lang>` and
    // used as a catalog key, so an unknown one is dropped rather than stored.
    const locale = isSupportedLocale(data.user.locale)
      ? data.user.locale
      : undefined;
    if (data.user.locale && !locale) {
      skipped.push({ kind: 'localeUnavailable', locale: data.user.locale });
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        notificationHour: data.user.notificationHour,
        notificationMinute: data.user.notificationMinute,
        ...(locale ? { locale } : {}),
      },
    });

    await tx.userNotificationTime.deleteMany({ where: { userId } });
    if (data.user.notificationTimes.length > 0) {
      await tx.userNotificationTime.createMany({
        data: data.user.notificationTimes.map((time) => ({
          userId,
          taskType: time.taskType,
          hour: time.hour,
          minute: time.minute,
        })),
      });
    }
  }

  /**
   * Pulls the three things a bundle is allowed to contain out of the zip.
   *
   * Two independent things stop a traversal entry here. yauzl validates entry
   * names as it reads the central directory and errors out on `..` or an
   * absolute path, so an archive containing one is rejected whole -- which is
   * the right answer, because a bundle carrying `../../etc/cron.d/x` is not a
   * damaged backup, it is a hostile one. Behind that, entry names are matched
   * against an allowlist rather than sanitised, and no name is ever joined onto
   * a filesystem path: an image is looked up by the uuid its name carries and
   * handed back as bytes in memory. The allowlist is not redundant -- it is
   * what rejects the names yauzl considers perfectly legal (`notes.txt`,
   * `images/x.php`), and it would still hold if yauzl's validation were ever
   * turned off by an option.
   *
   * Entries that are merely unrecognised are skipped in silence, so a future
   * format can add entries without older servers choking on them.
   */
  private async readBundle(file: Buffer): Promise<BundleContents> {
    let zipfile: yauzl.ZipFile;
    try {
      zipfile = await yauzl.fromBufferPromise(file, { lazyEntries: true });
    } catch {
      throw new BadRequestException(
        apiError(ERROR_CODES.bundleInvalid, 'Not a readable zip file'),
      );
    }

    const images = new Map<string, Buffer>();
    let manifestRaw: Buffer | null = null;
    let dataRaw: Buffer | null = null;
    let totalBytes = 0;

    await readEntries(zipfile, async (entry) => {
      const name = entry.fileName;
      const imageId = parseImageEntry(name);
      const wanted =
        name === MANIFEST_ENTRY || name === DATA_ENTRY || imageId !== null;
      const limit = imageId !== null ? MAX_IMAGE_BYTES : MAX_JSON_BYTES;

      // A declared size is only a hint -- readEntry enforces the same cap on
      // the bytes that actually arrive -- but checking it first means an
      // obviously oversized entry is never decompressed at all.
      if (!wanted || entry.uncompressedSize > limit) return;

      totalBytes += entry.uncompressedSize;
      if (totalBytes > MAX_UNCOMPRESSED_BYTES) {
        throw new BadRequestException(
          apiError(
            ERROR_CODES.bundleTooLarge,
            'Backup expands to more data than can be imported at once',
          ),
        );
      }

      const contents = await readEntry(zipfile, entry, limit);

      if (name === MANIFEST_ENTRY) manifestRaw = contents;
      else if (name === DATA_ENTRY) dataRaw = contents;
      else if (imageId !== null) images.set(imageId, contents);
    });

    if (!manifestRaw || !dataRaw) {
      throw new BadRequestException(
        apiError(
          ERROR_CODES.bundleInvalid,
          'Backup is missing manifest.json or data.json',
        ),
      );
    }

    // Manifest first: a version this server cannot read should be reported as
    // such rather than as whatever data.json happens to fail on.
    const manifest = parseManifest(parseJsonEntry(MANIFEST_ENTRY, manifestRaw));
    const data = parseBundleData(parseJsonEntry(DATA_ENTRY, dataRaw));

    return { manifest, data, images };
  }
}

/**
 * Walks the archive one entry at a time, awaiting the handler before pulling
 * the next -- `lazyEntries` is what keeps a large bundle from being decompressed
 * all at once.
 *
 * Anything yauzl itself refuses lands in the catch below. That includes the
 * hostile cases: yauzl validates entry names while reading the central
 * directory and errors on `..` or an absolute path, so such an archive is
 * rejected whole. Reporting it as a 400 rather than letting it surface as a 500
 * matters -- it is a statement about the file, not about the server.
 */
async function readEntries(
  zipfile: yauzl.ZipFile,
  handler: (entry: yauzl.Entry) => Promise<void>,
): Promise<void> {
  try {
    await new Promise<void>((resolve, reject) => {
      zipfile.on('error', reject);
      zipfile.on('end', resolve);
      zipfile.on('entry', (entry: yauzl.Entry) => {
        handler(entry).then(() => zipfile.readEntry(), reject);
      });
      zipfile.readEntry();
    });
  } catch (err) {
    // The caps above are already expressed as typed rejections; only yauzl's
    // own failures need translating.
    if (err instanceof HttpException) throw err;
    throw new BadRequestException(
      apiError(
        ERROR_CODES.bundleInvalid,
        `Backup file could not be read: ${err instanceof Error ? err.message : 'unknown error'}`,
      ),
    );
  }
}

/** Reads one entry, abandoning it if it exceeds what its header declared. */
async function readEntry(
  zipfile: yauzl.ZipFile,
  entry: yauzl.Entry,
  limit: number,
): Promise<Buffer> {
  const stream = await zipfile.openReadStreamPromise(entry);
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of stream as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > limit) {
      stream.destroy();
      throw new BadRequestException(
        apiError(
          ERROR_CODES.bundleTooLarge,
          `Entry ${entry.fileName} is larger than allowed`,
        ),
      );
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

function cleanupFiles(paths: string[]) {
  for (const filePath of paths) {
    try {
      fs.rmSync(filePath, { force: true });
    } catch {
      // Best effort: the import already failed, and an orphaned file is
      // strictly better than masking the original error with this one.
    }
  }
}
