import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ZipFile } from 'yazl';
import { ImportService } from './import.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { BUNDLE_FORMAT_VERSION } from './bundle.js';

/**
 * Bundles here are real zips built with yazl and read by the real yauzl, so
 * what is under test is the file a user actually uploads. Only Prisma, sharp
 * and the deployment root are stood in for.
 */

// Re-encoding is the validation step, so the stand-in behaves like one: it
// writes a real file for input it can "decode" and throws for input it cannot.
vi.mock('sharp', async () => {
  const nodeFs = await import('fs');
  const toFile = vi.fn((destination: string, buffer: Buffer) => {
    if (buffer.toString('latin1').includes('CORRUPT')) {
      return Promise.reject(
        new Error('Input buffer contains unsupported image format'),
      );
    }
    nodeFs.writeFileSync(destination, `encoded:${buffer.toString('latin1')}`);
    return Promise.resolve({});
  });

  const sharpFn = vi.fn((buffer: Buffer) => ({
    resize: vi.fn().mockReturnValue({
      webp: vi.fn().mockReturnValue({
        toFile: (destination: string) => toFile(destination, buffer),
      }),
    }),
  }));

  return { default: sharpFn };
});

const IMAGE_A = 'aaaaaaaa-2222-3333-4444-555555555555';
const IMAGE_B = 'bbbbbbbb-2222-3333-4444-555555555555';
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface ZipEntry {
  name: string;
  content: string | Buffer;
}

/**
 * `rename` rewrites entry names in the finished archive, which is the only way
 * to author the names yazl refuses (`..`, absolute paths) -- exactly the names
 * an attacker would choose. A name occurs in both the local header and the
 * central directory, so the replacement must preserve length or every offset
 * after it shifts.
 */
async function buildZip(
  entries: ZipEntry[],
  rename?: Record<string, string>,
): Promise<Buffer> {
  const zip = new ZipFile();
  for (const entry of entries) {
    zip.addBuffer(Buffer.from(entry.content as string), entry.name);
  }
  zip.end();

  const chunks: Buffer[] = [];
  for await (const chunk of zip.outputStream as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  let buffer = Buffer.concat(chunks);

  if (rename) {
    // latin1 round-trips every byte, so binary sections survive untouched.
    let raw = buffer.toString('latin1');
    for (const [from, to] of Object.entries(rename)) {
      if (from.length !== to.length) {
        throw new Error(`rename must preserve length: ${from} -> ${to}`);
      }
      raw = raw.split(from).join(to);
    }
    buffer = Buffer.from(raw, 'latin1');
  }

  return buffer;
}

function manifest(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    app: 'zaindari',
    formatVersion: BUNDLE_FORMAT_VERSION,
    exportedAt: '2026-07-24T10:00:00.000Z',
    user: { username: 'asier', displayName: 'Asier' },
    counts: { plants: 1, images: 0 },
    missingImages: [],
    ...overrides,
  });
}

function data(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    user: {
      locale: 'eu',
      notificationHour: 7,
      notificationMinute: 30,
      notificationTimes: [{ taskType: 'watering', hour: 6, minute: 15 }],
    },
    plants: [
      {
        name: 'Monstera',
        location: 'Living room',
        instructions: 'Bright indirect light',
        createdAt: '2025-01-01T00:00:00.000Z',
        schedules: [
          {
            taskType: 'watering',
            intervalDays: 7,
            hour: 8,
            minute: 0,
            enabled: true,
          },
        ],
        images: [],
      },
    ],
    ...overrides,
  });
}

describe('ImportService', () => {
  let service: ImportService;
  let root: string;
  let tx: Record<string, Record<string, ReturnType<typeof vi.fn>>>;
  let prisma: {
    plant: {
      count: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    root = fs.mkdtempSync(path.join(os.tmpdir(), 'zaindari-import-'));
    vi.spyOn(process, 'cwd').mockReturnValue(root);

    tx = {
      plant: { deleteMany: vi.fn(), createMany: vi.fn() },
      plantSchedule: { createMany: vi.fn() },
      plantImage: { createMany: vi.fn() },
      user: { update: vi.fn() },
      userNotificationTime: { deleteMany: vi.fn(), createMany: vi.fn() },
    };

    prisma = {
      plant: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
      },
      $transaction: vi.fn((callback: (t: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ImportService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<ImportService>(ImportService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const plantRows = () => tx.plant.createMany.mock.calls[0][0].data;

  describe('reading the file', () => {
    it('rejects something that is not a zip at all', async () => {
      await expect(
        service.import('user-1', Buffer.from('this is not a zip'), 'append'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a zip with no manifest or data', async () => {
      const zip = await buildZip([{ name: 'readme.txt', content: 'hello' }]);

      await expect(service.import('user-1', zip, 'append')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses a bundle written by a newer version', async () => {
      const zip = await buildZip([
        { name: 'manifest.json', content: manifest({ formatVersion: 99 }) },
        { name: 'data.json', content: data() },
      ]);

      await expect(
        service.import('user-1', zip, 'append'),
      ).rejects.toMatchObject({
        response: { code: 'data.bundleVersionUnsupported' },
      });
    });

    it('ignores entries it does not recognise', async () => {
      const zip = await buildZip([
        { name: 'manifest.json', content: manifest() },
        { name: 'data.json', content: data() },
        { name: 'notes.txt', content: 'ignore me' },
        { name: 'images/not-a-uuid.webp', content: 'ignore me too' },
      ]);

      const summary = await service.import('user-1', zip, 'append');

      expect(summary.plants).toBe(1);
      expect(summary.images).toBe(0);
    });
  });

  describe('hostile archives', () => {
    // A bundle carrying a traversal entry is not a damaged backup, it is a
    // hostile one, so the whole archive is refused rather than partly imported.
    // yauzl validates entry names as it reads the central directory; the
    // allowlist in bundle.ts is the second, independent line behind it.
    it.each([
      ['../../../etc/passwd', 'benign-placeholder1'],
      ['/etc/cron.d/zaindari', 'benign-placeholder-2'],
      ['images/../../escape.sh', 'benign-placeholder-xy3'],
    ])('refuses an archive containing %j', async (evil, placeholder) => {
      expect(placeholder).toHaveLength(evil.length);

      const zip = await buildZip(
        [
          { name: 'manifest.json', content: manifest() },
          { name: 'data.json', content: data() },
          { name: placeholder, content: 'pwned' },
        ],
        { [placeholder]: evil },
      );

      const before = listFiles(root);

      // A 400 about the file, not a 500 about the server.
      await expect(
        service.import('user-1', zip, 'append'),
      ).rejects.toMatchObject({ response: { code: 'data.bundleInvalid' } });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(listFiles(root)).toEqual(before);
      expect(fs.existsSync('/etc/cron.d/zaindari')).toBe(false);
    });

    it('abandons an entry that expands past its limit', async () => {
      // 12 MB of zeroes compresses to almost nothing but exceeds the per-image
      // cap, so it is dropped rather than buffered.
      const bomb = Buffer.alloc(12 * 1024 * 1024, 0);
      const zip = await buildZip([
        { name: 'manifest.json', content: manifest() },
        {
          name: 'data.json',
          content: data({
            plants: [
              { name: 'Monstera', images: [{ id: IMAGE_A, isCurrent: true }] },
            ],
          }),
        },
        { name: `images/${IMAGE_A}.webp`, content: bomb },
      ]);

      const summary = await service.import('user-1', zip, 'append');

      expect(summary.images).toBe(0);
      expect(summary.skipped).toEqual([
        { kind: 'photosMissing', plant: 'Monstera', count: 1 },
      ]);
    });
  });

  describe('what gets written', () => {
    it('creates the plants and their schedules under the importing user', async () => {
      const zip = await buildZip([
        { name: 'manifest.json', content: manifest() },
        { name: 'data.json', content: data() },
      ]);

      const summary = await service.import('user-1', zip, 'append');

      expect(summary).toMatchObject({
        mode: 'append',
        plants: 1,
        replacedPlants: 0,
      });
      expect(plantRows()).toEqual([
        expect.objectContaining({
          ownerId: 'user-1',
          name: 'Monstera',
          location: 'Living room',
          instructions: 'Bright indirect light',
        }),
      ]);
      expect(tx.plantSchedule.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            taskType: 'watering',
            intervalDays: 7,
            hour: 8,
          }),
        ],
      });
    });

    // A bundle must not be able to name the row it becomes: no collisions, no
    // resurrecting a deleted id, no writing into another account.
    it('gives every plant a fresh id owned by the caller', async () => {
      const zip = await buildZip([
        { name: 'manifest.json', content: manifest() },
        {
          name: 'data.json',
          content: data({
            plants: [
              { name: 'A', id: 'attacker-chosen', ownerId: 'someone-else' },
              { name: 'B' },
            ],
          }),
        },
      ]);

      await service.import('user-1', zip, 'append');
      const rows = plantRows();

      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.id).toMatch(UUID_RE);
        expect(row.id).not.toBe('attacker-chosen');
        expect(row.ownerId).toBe('user-1');
      }
    });

    it('never creates tasks', async () => {
      const zip = await buildZip([
        { name: 'manifest.json', content: manifest() },
        {
          name: 'data.json',
          content: data({
            plants: [
              {
                name: 'Monstera',
                tasks: [
                  {
                    taskType: 'watering',
                    status: 'pending',
                    dueAt: '2020-01-01',
                  },
                ],
              },
            ],
          }),
        },
      ]);

      await service.import('user-1', zip, 'append');

      // Imported plants have no history at all, which createDueTasks reads as
      // "no tasks exist -- create the first one" on the next tick.
      expect(tx).not.toHaveProperty('task.createMany');
      expect(JSON.stringify(plantRows())).not.toContain('dueAt');
    });
  });

  describe('photos', () => {
    const withPhotos = () =>
      data({
        plants: [
          {
            name: 'Monstera',
            images: [
              {
                id: IMAGE_A,
                isCurrent: true,
                createdAt: '2025-02-01T00:00:00.000Z',
              },
              {
                id: IMAGE_B,
                isCurrent: false,
                createdAt: '2025-01-01T00:00:00.000Z',
              },
            ],
          },
        ],
      });

    it('re-encodes each photo into the new plant directory', async () => {
      const zip = await buildZip([
        { name: 'manifest.json', content: manifest() },
        { name: 'data.json', content: withPhotos() },
        { name: `images/${IMAGE_A}.webp`, content: 'photo-a' },
        { name: `images/${IMAGE_B}.webp`, content: 'photo-b' },
      ]);

      const summary = await service.import('user-1', zip, 'append');
      const plantId = plantRows()[0].id;
      const rows = tx.plantImage.createMany.mock.calls[0][0].data;

      expect(summary.images).toBe(2);
      expect(rows).toHaveLength(2);

      for (const row of rows) {
        // Server-generated path, never one the bundle chose.
        expect(row.plantId).toBe(plantId);
        expect(row.id).toMatch(UUID_RE);
        expect(row.filePath).toBe(
          path.join('uploads', plantId, `${row.id}.webp`),
        );
        expect(fs.existsSync(path.join(root, row.filePath))).toBe(true);
      }

      expect(
        rows.filter((r: { isCurrent: boolean }) => r.isCurrent),
      ).toHaveLength(1);
    });

    it('skips a photo whose file was not in the bundle', async () => {
      const zip = await buildZip([
        { name: 'manifest.json', content: manifest() },
        { name: 'data.json', content: withPhotos() },
        { name: `images/${IMAGE_A}.webp`, content: 'photo-a' },
      ]);

      const summary = await service.import('user-1', zip, 'append');

      expect(summary.images).toBe(1);
      expect(summary.skipped).toEqual([
        { kind: 'photosMissing', plant: 'Monstera', count: 1 },
      ]);
    });

    // One corrupt photo should not cost the user the other three hundred.
    it('skips a photo sharp cannot decode and imports the rest', async () => {
      const zip = await buildZip([
        { name: 'manifest.json', content: manifest() },
        { name: 'data.json', content: withPhotos() },
        { name: `images/${IMAGE_A}.webp`, content: 'CORRUPT' },
        { name: `images/${IMAGE_B}.webp`, content: 'photo-b' },
      ]);

      const summary = await service.import('user-1', zip, 'append');

      expect(summary.plants).toBe(1);
      expect(summary.images).toBe(1);
      expect(summary.skipped).toEqual([
        { kind: 'photosUnreadable', plant: 'Monstera', count: 1 },
      ]);
    });

    // Rows without files would leave broken photos in the UI with no way to
    // find them, so the files are what gets rolled back.
    it('removes files it wrote when the transaction fails', async () => {
      prisma.$transaction.mockRejectedValue(new Error('deadlock'));

      const zip = await buildZip([
        { name: 'manifest.json', content: manifest() },
        { name: 'data.json', content: withPhotos() },
        { name: `images/${IMAGE_A}.webp`, content: 'photo-a' },
        { name: `images/${IMAGE_B}.webp`, content: 'photo-b' },
      ]);

      // A database failure is not the file's fault, so it must not be reported
      // as a damaged backup -- that sends the user off to re-export a good one.
      await expect(
        service.import('user-1', zip, 'append'),
      ).rejects.toMatchObject({ response: { code: 'data.importFailed' } });

      expect(listFiles(path.join(root, 'uploads'))).toEqual([]);
    });
  });

  describe('append vs replace', () => {
    const existing = [{ id: 'old-1' }, { id: 'old-2' }];

    it('leaves existing plants alone when appending', async () => {
      prisma.plant.findMany.mockResolvedValue(existing);
      const zip = await buildZip([
        { name: 'manifest.json', content: manifest() },
        { name: 'data.json', content: data() },
      ]);

      const summary = await service.import('user-1', zip, 'append');

      expect(tx.plant.deleteMany).not.toHaveBeenCalled();
      expect(summary.replacedPlants).toBe(0);
    });

    it("deletes the caller's own plants when replacing", async () => {
      prisma.plant.findMany.mockResolvedValue(existing);
      fs.mkdirSync(path.join(root, 'uploads', 'old-1'), { recursive: true });
      fs.writeFileSync(path.join(root, 'uploads', 'old-1', 'p.webp'), 'old');

      const zip = await buildZip([
        { name: 'manifest.json', content: manifest() },
        { name: 'data.json', content: data() },
      ]);

      const summary = await service.import('user-1', zip, 'replace');

      expect(prisma.plant.findMany).toHaveBeenCalledWith({
        where: { ownerId: 'user-1' },
        select: { id: true },
      });
      expect(tx.plant.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['old-1', 'old-2'] } },
      });
      expect(summary.replacedPlants).toBe(2);
      // Removed only after the commit, so a rollback cannot lose files that
      // still have rows.
      expect(fs.existsSync(path.join(root, 'uploads', 'old-1'))).toBe(false);
    });

    it('keeps the old photo directories if the transaction fails', async () => {
      prisma.plant.findMany.mockResolvedValue(existing);
      fs.mkdirSync(path.join(root, 'uploads', 'old-1'), { recursive: true });
      fs.writeFileSync(path.join(root, 'uploads', 'old-1', 'p.webp'), 'old');
      prisma.$transaction.mockRejectedValue(new Error('deadlock'));

      const zip = await buildZip([
        { name: 'manifest.json', content: manifest() },
        { name: 'data.json', content: data() },
      ]);

      await expect(
        service.import('user-1', zip, 'replace'),
      ).rejects.toMatchObject({ response: { code: 'data.importFailed' } });

      expect(fs.existsSync(path.join(root, 'uploads', 'old-1', 'p.webp'))).toBe(
        true,
      );
    });

    // "Append" means take these plants into the account I already have, where
    // silently rewriting the language would be a surprise.
    it('does not touch settings when appending', async () => {
      const zip = await buildZip([
        { name: 'manifest.json', content: manifest() },
        { name: 'data.json', content: data() },
      ]);

      await service.import('user-1', zip, 'append');

      expect(tx.user.update).not.toHaveBeenCalled();
      expect(tx.userNotificationTime.deleteMany).not.toHaveBeenCalled();
    });

    it('restores settings when replacing', async () => {
      const zip = await buildZip([
        { name: 'manifest.json', content: manifest() },
        { name: 'data.json', content: data() },
      ]);

      await service.import('user-1', zip, 'replace');

      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { notificationHour: 7, notificationMinute: 30, locale: 'eu' },
      });
      expect(tx.userNotificationTime.createMany).toHaveBeenCalledWith({
        data: [{ userId: 'user-1', taskType: 'watering', hour: 6, minute: 15 }],
      });
    });

    // The locale is echoed into `<html lang>` and used as a catalog key.
    it('drops a locale this build does not ship', async () => {
      const zip = await buildZip([
        { name: 'manifest.json', content: manifest() },
        { name: 'data.json', content: data({ user: { locale: 'kli' } }) },
      ]);

      const summary = await service.import('user-1', zip, 'replace');

      expect(tx.user.update.mock.calls[0][0].data.locale).toBeUndefined();
      expect(summary.skipped).toEqual([
        { kind: 'localeUnavailable', locale: 'kli' },
      ]);
    });
  });

  describe('preview', () => {
    it('reports what the file holds without writing anything', async () => {
      prisma.plant.count.mockResolvedValue(4);
      const zip = await buildZip([
        { name: 'manifest.json', content: manifest() },
        {
          name: 'data.json',
          content: data({
            plants: [
              { name: 'Monstera', images: [{ id: IMAGE_A, isCurrent: true }] },
            ],
          }),
        },
        { name: `images/${IMAGE_A}.webp`, content: 'photo-a' },
      ]);

      const preview = await service.preview('user-1', zip);

      expect(preview).toMatchObject({
        plants: 1,
        images: 1,
        existingPlants: 4,
      });
      expect(preview.manifest.user.username).toBe('asier');
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(listFiles(path.join(root, 'uploads'))).toEqual([]);
    });
  });
});

/** Every file under `dir`, relative and sorted, for before/after comparison. */
function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath ?? dir, entry.name))
    .sort();
}
