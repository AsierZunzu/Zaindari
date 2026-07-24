import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import {
  BUNDLE_FORMAT_VERSION,
  imageEntryName,
  parseBundleData,
  parseImageEntry,
  parseJsonEntry,
  parseManifest,
} from './bundle.js';

const UUID = '11111111-2222-3333-4444-555555555555';

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    app: 'zaindari',
    formatVersion: BUNDLE_FORMAT_VERSION,
    exportedAt: '2026-07-24T10:00:00.000Z',
    user: { username: 'asier', displayName: 'Asier' },
    counts: { plants: 1, images: 1 },
    missingImages: [],
    ...overrides,
  };
}

describe('parseImageEntry', () => {
  it('accepts the names an export writes', () => {
    expect(parseImageEntry(imageEntryName(UUID))).toBe(UUID);
  });

  // The allowlist is what closes zip-slip: no entry name is ever joined onto a
  // filesystem path, so anything that is not exactly images/<uuid>.webp has
  // nowhere to land.
  it.each([
    '../../etc/passwd',
    'images/../../etc/passwd',
    'images/../x.webp',
    '/etc/passwd',
    'images/..%2f..%2fx.webp',
    'C:\\Windows\\system32\\x.webp',
    'images/x.webp',
    `images/${UUID}.webp/../evil`,
    `images/${UUID}.php`,
    `images/${UUID}.webp\0.php`,
    `IMAGES/${UUID}.webp`,
    '',
  ])('rejects %j', (name) => {
    expect(parseImageEntry(name)).toBeNull();
  });
});

describe('parseManifest', () => {
  it('reads a manifest an export wrote', () => {
    const parsed = parseManifest(manifest());
    expect(parsed.formatVersion).toBe(BUNDLE_FORMAT_VERSION);
    expect(parsed.user.username).toBe('asier');
  });

  it('rejects a file that is not a Zaindari backup', () => {
    expect(() => parseManifest(manifest({ app: 'something-else' }))).toThrow(
      BadRequestException,
    );
  });

  // Refusing beats guessing: a newer file may carry fields whose absence this
  // server would read as "the user turned it off".
  it('refuses a format version newer than it understands', () => {
    let thrown: BadRequestException | undefined;
    try {
      parseManifest(manifest({ formatVersion: BUNDLE_FORMAT_VERSION + 1 }));
    } catch (err) {
      thrown = err as BadRequestException;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    expect(thrown?.getResponse()).toMatchObject({
      code: 'data.bundleVersionUnsupported',
      params: {
        version: BUNDLE_FORMAT_VERSION + 1,
        supported: BUNDLE_FORMAT_VERSION,
      },
    });
  });

  it('rejects a manifest with no version at all', () => {
    expect(() => parseManifest(manifest({ formatVersion: 'one' }))).toThrow(
      BadRequestException,
    );
  });
});

describe('parseJsonEntry', () => {
  it('reports unparseable JSON as a bad request, not a crash', () => {
    expect(() => parseJsonEntry('data.json', Buffer.from('{ nope'))).toThrow(
      BadRequestException,
    );
  });
});

describe('parseBundleData', () => {
  it('keeps a well-formed plant intact', () => {
    const { plants } = parseBundleData({
      user: {},
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
              minute: 30,
              enabled: true,
            },
          ],
          images: [
            {
              id: UUID,
              isCurrent: true,
              createdAt: '2025-01-02T00:00:00.000Z',
            },
          ],
        },
      ],
    });

    expect(plants).toHaveLength(1);
    expect(plants[0]).toMatchObject({
      name: 'Monstera',
      location: 'Living room',
      schedules: [
        { taskType: 'watering', intervalDays: 7, hour: 8, minute: 30 },
      ],
    });
  });

  it('drops a plant with no usable name rather than inventing one', () => {
    const { plants } = parseBundleData({
      plants: [{ name: '   ' }, { name: 42 }, {}, null, { name: 'Fern' }],
    });

    expect(plants.map((p) => p.name)).toEqual(['Fern']);
  });

  it('rejects a payload with no plants array', () => {
    expect(() => parseBundleData({ user: {} })).toThrow(BadRequestException);
  });

  // @@unique([plantId, taskType]) -- a duplicate would fail the insert and take
  // the whole import down with it.
  it('keeps only the first schedule for a task type', () => {
    const { plants } = parseBundleData({
      plants: [
        {
          name: 'Fern',
          schedules: [
            { taskType: 'watering', intervalDays: 3 },
            { taskType: 'watering', intervalDays: 99 },
          ],
        },
      ],
    });

    expect(plants[0].schedules).toEqual([
      {
        taskType: 'watering',
        intervalDays: 3,
        hour: null,
        minute: null,
        enabled: true,
      },
    ]);
  });

  it('drops schedules with an unknown task type or an impossible interval', () => {
    const { plants } = parseBundleData({
      plants: [
        {
          name: 'Fern',
          schedules: [
            { taskType: 'sacrificing', intervalDays: 3 },
            { taskType: 'misting', intervalDays: 0 },
            { taskType: 'misting', intervalDays: -5 },
            { taskType: 'repotting', intervalDays: 1.5 },
            { taskType: 'fertilization', intervalDays: 30 },
          ],
        },
      ],
    });

    expect(plants[0].schedules).toEqual([
      {
        taskType: 'fertilization',
        intervalDays: 30,
        hour: null,
        minute: null,
        enabled: true,
      },
    ]);
  });

  // Hour and minute are one setting; a row with an hour but no minute resolves
  // ambiguously in resolveNotificationTime.
  it('keeps hour and minute together', () => {
    const { plants } = parseBundleData({
      plants: [
        {
          name: 'Fern',
          schedules: [
            { taskType: 'watering', intervalDays: 3, hour: 7 },
            { taskType: 'misting', intervalDays: 2, minute: 45 },
          ],
        },
      ],
    });

    expect(plants[0].schedules).toEqual([
      {
        taskType: 'watering',
        intervalDays: 3,
        hour: 7,
        minute: 0,
        enabled: true,
      },
      {
        taskType: 'misting',
        intervalDays: 2,
        hour: null,
        minute: null,
        enabled: true,
      },
    ]);
  });

  it('preserves a disabled schedule', () => {
    const { plants } = parseBundleData({
      plants: [
        {
          name: 'Fern',
          schedules: [{ taskType: 'misting', intervalDays: 2, enabled: false }],
        },
      ],
    });

    expect(plants[0].schedules[0].enabled).toBe(false);
  });

  // The client reads `currentImage` from a one-element array, so a second
  // current photo would make which one shows arbitrary.
  it('allows at most one current photo per plant', () => {
    const other = '99999999-2222-3333-4444-555555555555';
    const { plants } = parseBundleData({
      plants: [
        {
          name: 'Fern',
          images: [
            { id: UUID, isCurrent: true },
            { id: other, isCurrent: true },
          ],
        },
      ],
    });

    expect(plants[0].images.map((i) => i.isCurrent)).toEqual([true, false]);
  });

  it('drops image ids that are not uuids', () => {
    const { plants } = parseBundleData({
      plants: [
        {
          name: 'Fern',
          images: [
            { id: '../../etc/passwd', isCurrent: true },
            { id: 'not-a-uuid' },
            { id: UUID },
          ],
        },
      ],
    });

    expect(plants[0].images.map((i) => i.id)).toEqual([UUID]);
  });

  it('truncates unbounded text instead of handing it to Postgres', () => {
    const { plants } = parseBundleData({
      plants: [{ name: 'x'.repeat(10_000), instructions: 'y'.repeat(100_000) }],
    });

    expect(plants[0].name).toHaveLength(200);
    expect(plants[0].instructions).toHaveLength(5000);
  });

  it('falls back to defaults for a user block that is missing or nonsense', () => {
    const { user } = parseBundleData({
      plants: [],
      user: { notificationHour: 99 },
    });

    expect(user).toEqual({
      locale: '',
      notificationHour: 9,
      notificationMinute: 0,
      notificationTimes: [],
    });
  });

  it('keeps valid per-task reminder times and drops the rest', () => {
    const { user } = parseBundleData({
      plants: [],
      user: {
        notificationTimes: [
          { taskType: 'watering', hour: 7, minute: 15 },
          { taskType: 'watering', hour: 9 },
          { taskType: 'misting', hour: 25 },
          { taskType: 'nonsense', hour: 7 },
        ],
      },
    });

    expect(user.notificationTimes).toEqual([
      { taskType: 'watering', hour: 7, minute: 15 },
    ]);
  });
});
