import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PassThrough } from 'stream';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import yauzl from 'yauzl';
import type { Response } from 'express';
import { ExportService, exportFilename } from './export.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { BUNDLE_FORMAT_VERSION, type BundleData } from './bundle.js';

/**
 * The archive is built with the real yazl and read back with the real yauzl, so
 * these assertions are about the file a user actually downloads rather than
 * about a mocked writer. Only Prisma and the filesystem root are stood in for.
 */

const IMAGE_A = 'aaaaaaaa-2222-3333-4444-555555555555';
const IMAGE_B = 'bbbbbbbb-2222-3333-4444-555555555555';

interface Captured {
  headers: Record<string, string>;
  entries: Map<string, Buffer>;
}

/** A Response that is really a stream, so the pipe in the service does its job. */
function mockResponse(): {
  res: Response;
  headers: Record<string, string>;
  done: Promise<Buffer>;
} {
  const stream = new PassThrough();
  const headers: Record<string, string> = {};
  const chunks: Buffer[] = [];

  stream.on('data', (chunk: Buffer) => chunks.push(chunk));

  const done = new Promise<Buffer>((resolve) => {
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });

  const res = Object.assign(stream, {
    setHeader: (name: string, value: string) => {
      headers[name.toLowerCase()] = value;
    },
  }) as unknown as Response;

  return { res, headers, done };
}

async function readZip(buffer: Buffer): Promise<Map<string, Buffer>> {
  const zipfile = await yauzl.fromBufferPromise(buffer, { lazyEntries: true });
  const entries = new Map<string, Buffer>();

  await new Promise<void>((resolve, reject) => {
    zipfile.on('error', reject);
    zipfile.on('end', resolve);
    zipfile.on('entry', (entry: yauzl.Entry) => {
      void (async () => {
        const stream = await zipfile.openReadStreamPromise(entry);
        const chunks: Buffer[] = [];
        for await (const chunk of stream as AsyncIterable<Buffer>)
          chunks.push(chunk);
        entries.set(entry.fileName, Buffer.concat(chunks));
        zipfile.readEntry();
      })().catch(reject);
    });
    zipfile.readEntry();
  });

  return entries;
}

describe('ExportService', () => {
  let service: ExportService;
  let prisma: {
    user: { findUnique: ReturnType<typeof vi.fn> };
    plant: { findMany: ReturnType<typeof vi.fn> };
  };
  let root: string;

  const mockUser = {
    username: 'asier',
    displayName: 'Asier',
    locale: 'eu',
    notificationHour: 7,
    notificationMinute: 30,
    notificationTimes: [{ taskType: 'watering', hour: 6, minute: 15 }],
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // A real directory standing in for the deployment root, so yazl reads real
    // files without the test writing into the repository.
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'zaindari-export-'));
    vi.spyOn(process, 'cwd').mockReturnValue(root);

    prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(mockUser) },
      plant: { findMany: vi.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ExportService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<ExportService>(ExportService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  function writeImageFile(plantId: string, imageId: string) {
    const dir = path.join(root, 'uploads', plantId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${imageId}.webp`), `bytes-of-${imageId}`);
    return path.join('uploads', plantId, `${imageId}.webp`);
  }

  function plantRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'plant-1',
      name: 'Monstera',
      location: 'Living room',
      instructions: 'Bright indirect light',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
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
      ...overrides,
    };
  }

  async function runExport(): Promise<Captured> {
    const { res, headers, done } = mockResponse();
    await service.streamForUser('user-1', res);
    return { headers, entries: await readZip(await done) };
  }

  it('scopes the export to plants the user owns', async () => {
    await runExport();

    // Not the owner-or-shared rule findAllForUser applies: a share is a
    // permission to help, not a claim on someone else's photo history.
    expect(prisma.plant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: 'user-1' } }),
    );
  });

  it('writes a manifest naming the format and the user', async () => {
    prisma.plant.findMany.mockResolvedValue([plantRow()]);

    const { entries } = await runExport();
    const manifest = JSON.parse(entries.get('manifest.json')!.toString());

    expect(manifest).toMatchObject({
      app: 'zaindari',
      formatVersion: BUNDLE_FORMAT_VERSION,
      user: { username: 'asier', displayName: 'Asier' },
      counts: { plants: 1, images: 0 },
    });
  });

  it('carries plants, their schedules and the user settings', async () => {
    prisma.plant.findMany.mockResolvedValue([plantRow()]);

    const { entries } = await runExport();
    const data: BundleData = JSON.parse(entries.get('data.json')!.toString());

    expect(data.plants).toHaveLength(1);
    expect(data.plants[0]).toMatchObject({
      name: 'Monstera',
      location: 'Living room',
      schedules: [
        { taskType: 'watering', intervalDays: 7, hour: 8, minute: 0 },
      ],
    });
    expect(data.user).toMatchObject({
      locale: 'eu',
      notificationHour: 7,
      notificationMinute: 30,
      notificationTimes: [{ taskType: 'watering', hour: 6, minute: 15 }],
    });
  });

  it('includes each photo as its own entry', async () => {
    prisma.plant.findMany.mockResolvedValue([
      plantRow({
        images: [
          {
            id: IMAGE_A,
            filePath: writeImageFile('plant-1', IMAGE_A),
            isCurrent: true,
            createdAt: new Date('2025-02-01T00:00:00.000Z'),
          },
        ],
      }),
    ]);

    const { entries } = await runExport();

    expect(entries.get(`images/${IMAGE_A}.webp`)?.toString()).toBe(
      `bytes-of-${IMAGE_A}`,
    );
  });

  // One lost file must not make a whole garden unexportable.
  it('records a photo whose file is gone instead of failing', async () => {
    prisma.plant.findMany.mockResolvedValue([
      plantRow({
        images: [
          {
            id: IMAGE_A,
            filePath: writeImageFile('plant-1', IMAGE_A),
            isCurrent: true,
            createdAt: new Date(),
          },
          {
            id: IMAGE_B,
            filePath: path.join('uploads', 'plant-1', `${IMAGE_B}.webp`),
            isCurrent: false,
            createdAt: new Date(),
          },
        ],
      }),
    ]);

    const { entries } = await runExport();
    const manifest = JSON.parse(entries.get('manifest.json')!.toString());

    expect(manifest.missingImages).toEqual([IMAGE_B]);
    expect(manifest.counts.images).toBe(1);
    expect(entries.has(`images/${IMAGE_A}.webp`)).toBe(true);
    expect(entries.has(`images/${IMAGE_B}.webp`)).toBe(false);
  });

  // The bundle is a file users mail to themselves; nothing that authenticates
  // them, binds a device, or names another account belongs in it.
  it('leaks no credentials, device bindings or other accounts', async () => {
    prisma.plant.findMany.mockResolvedValue([plantRow()]);

    const { entries } = await runExport();
    const raw = entries.get('data.json')!.toString();

    for (const forbidden of [
      'passwordHash',
      'password_hash',
      'oidcSubject',
      'isAdmin',
      'ownerId',
      'shares',
      'refreshToken',
      'endpoint',
      'p256dh',
    ]) {
      expect(raw).not.toContain(forbidden);
    }

    // Selected, not filtered afterwards: the query itself must not read them.
    const select = prisma.user.findUnique.mock.calls[0][0].select;
    expect(select.passwordHash).toBeUndefined();
    expect(select.oidcSubject).toBeUndefined();
  });

  // Tasks are a live scheduling fact, not user data that travels.
  it('carries no tasks', async () => {
    prisma.plant.findMany.mockResolvedValue([plantRow()]);

    const { entries } = await runExport();
    const raw = entries.get('data.json')!.toString();

    // `taskType` is legitimately present on schedules, so this looks for the
    // fields only a Task row has.
    for (const field of [
      '"tasks"',
      'dueAt',
      'completedAt',
      'completedBy',
      'snoozeUntil',
      'skipReason',
    ]) {
      expect(raw).not.toContain(field);
    }

    expect(
      prisma.plant.findMany.mock.calls[0][0].include.tasks,
    ).toBeUndefined();
  });

  it('offers the archive as a download', async () => {
    const { headers } = await runExport();

    expect(headers['content-type']).toBe('application/zip');
    expect(headers['content-disposition']).toContain('attachment');
    expect(headers['content-disposition']).toContain('zaindari-asier-');
  });
});

describe('exportFilename', () => {
  it('names the file after the user and the day', () => {
    expect(exportFilename('asier', '2026-07-24T10:00:00.000Z')).toBe(
      'zaindari-asier-2026-07-24.zip',
    );
  });

  // A filename is a convenience for the person downloading, so the username is
  // reduced to what survives every filesystem and header encoding.
  it.each([
    ['Ana María', 'zaindari-ana-mar-a-2026-07-24.zip'],
    ['a/b\\c', 'zaindari-a-b-c-2026-07-24.zip'],
    ['"; rm -rf /', 'zaindari-rm-rf-2026-07-24.zip'],
    ['🌱', 'zaindari-2026-07-24.zip'],
  ])('reduces %j to a safe name', (username, expected) => {
    const filename = exportFilename(username, '2026-07-24T10:00:00.000Z');
    expect(filename).toBe(expected);
    expect(filename).toMatch(/^[a-z0-9.-]+$/);
  });
});
