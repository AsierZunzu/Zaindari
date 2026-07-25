import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import {
  SchedulesService,
  resolveNotificationTime,
} from './schedules.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('SchedulesService', () => {
  let service: SchedulesService;
  let prisma: {
    defaultSchedule: {
      findMany: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
    };
    plantSchedule: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    task: {
      deleteMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
    user: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    userNotificationTime: {
      findMany: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
  };

  const defaultRows = [
    { taskType: 'watering', intervalDays: 3 },
    { taskType: 'fertilization', intervalDays: 30 },
    { taskType: 'misting', intervalDays: 2 },
    { taskType: 'repotting', intervalDays: 365 },
  ];

  beforeEach(async () => {
    vi.clearAllMocks();

    prisma = {
      defaultSchedule: {
        findMany: vi.fn(),
        upsert: vi.fn(),
      },
      plantSchedule: {
        findMany: vi.fn(),
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(),
        delete: vi.fn(),
      },
      task: {
        deleteMany: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      },
      // The real client resolves the array; the mocked members return
      // undefined, so awaiting them is enough to mirror that.
      $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ notificationHour: 9, notificationMinute: 0 }),
        update: vi.fn().mockResolvedValue({}),
      },
      userNotificationTime: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<SchedulesService>(SchedulesService);
  });

  describe('seedDefaults', () => {
    it('should upsert all four default schedules', async () => {
      prisma.defaultSchedule.upsert.mockResolvedValue({});

      await service.seedDefaults();

      expect(prisma.defaultSchedule.upsert).toHaveBeenCalledTimes(4);

      // Only the interval is seeded — a reminder time is a user preference and
      // has no meaning on a task type.
      expect(prisma.defaultSchedule.upsert).toHaveBeenCalledWith({
        where: { taskType: 'watering' },
        update: {},
        create: { taskType: 'watering', intervalDays: 3 },
      });

      for (const [taskType, intervalDays] of [
        ['fertilization', 30],
        ['misting', 2],
        ['repotting', 365],
      ] as const) {
        expect(prisma.defaultSchedule.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { taskType },
            create: { taskType, intervalDays },
          }),
        );
      }
    });
  });

  describe('getUserNotificationTimes', () => {
    it('returns the base time when nothing is overridden', async () => {
      prisma.user.findUnique.mockResolvedValue({
        notificationHour: 21,
        notificationMinute: 30,
      });

      expect(await service.getUserNotificationTimes('user-1')).toEqual({
        base: { hour: 21, minute: 30 },
        overrides: {},
      });
    });

    it('returns per-task-type overrides alongside the base', async () => {
      prisma.userNotificationTime.findMany.mockResolvedValue([
        { taskType: 'watering', hour: 7, minute: 0 },
      ]);

      expect(await service.getUserNotificationTimes('user-1')).toEqual({
        base: { hour: 9, minute: 0 },
        overrides: { watering: { hour: 7, minute: 0 } },
      });
    });
  });

  describe('setUserBaseTime', () => {
    it('rejects an out-of-range time', async () => {
      await expect(
        service.setUserBaseTime('user-1', { hour: 24, minute: 0 }),
      ).rejects.toThrow();
      await expect(
        service.setUserBaseTime('user-1', { hour: 9, minute: 60 }),
      ).rejects.toThrow();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('stores hour and minute together', async () => {
      await service.setUserBaseTime('user-1', { hour: 7, minute: 30 });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { notificationHour: 7, notificationMinute: 30 },
      });
    });
  });

  describe('setUserTaskTime', () => {
    it('removes the override when given null', async () => {
      await service.setUserTaskTime('user-1', 'watering', null);

      expect(prisma.userNotificationTime.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', taskType: 'watering' },
      });
      expect(prisma.userNotificationTime.upsert).not.toHaveBeenCalled();
    });

    it('rejects an out-of-range override', async () => {
      await expect(
        service.setUserTaskTime('user-1', 'watering', { hour: -1, minute: 0 }),
      ).rejects.toThrow();
      expect(prisma.userNotificationTime.upsert).not.toHaveBeenCalled();
    });
  });

  describe('getMergedSchedules', () => {
    it('leaves the time unset when the plant pins none', async () => {
      prisma.defaultSchedule.findMany.mockResolvedValue(defaultRows);
      prisma.plantSchedule.findMany.mockResolvedValue([]);

      const result = await service.getMergedSchedules('plant-1');

      expect(result).toHaveLength(4);
      expect(result.every((s) => !s.isOverride)).toBe(true);
      expect(result.every((s) => s.enabled)).toBe(true);

      // Null, not a default hour: who gets reminded when is not knowable
      // without knowing who is being reminded.
      expect(result.find((s) => s.taskType === 'watering')).toEqual({
        taskType: 'watering',
        intervalDays: 3,
        hour: null,
        minute: null,
        isOverride: false,
        enabled: true,
      });
    });

    it('carries the time a plant pins for everyone', async () => {
      prisma.defaultSchedule.findMany.mockResolvedValue(defaultRows);
      prisma.plantSchedule.findMany.mockResolvedValue([
        {
          plantId: 'plant-1',
          taskType: 'watering',
          intervalDays: 1,
          hour: 7,
          minute: 30,
          enabled: true,
        },
      ]);

      const result = await service.getMergedSchedules('plant-1');

      expect(result.find((s) => s.taskType === 'watering')).toEqual({
        taskType: 'watering',
        intervalDays: 1,
        hour: 7,
        minute: 30,
        isOverride: true,
        enabled: true,
      });
    });

    it('should reflect disabled overrides', async () => {
      prisma.defaultSchedule.findMany.mockResolvedValue(defaultRows);
      prisma.plantSchedule.findMany.mockResolvedValue([
        {
          plantId: 'plant-1',
          taskType: 'misting',
          intervalDays: 2,
          hour: null,
          minute: null,
          enabled: false,
        },
      ]);

      const result = await service.getMergedSchedules('plant-1');

      const misting = result.find((s) => s.taskType === 'misting');
      expect(misting?.enabled).toBe(false);
      expect(misting?.isOverride).toBe(true);
    });
  });

  describe('removePlantSchedule', () => {
    it('treats dropping a disabled override as a re-enable', async () => {
      vi.setSystemTime(new Date('2024-06-01T14:00:00Z'));
      prisma.plantSchedule.findUnique.mockResolvedValue({
        plantId: 'plant-1',
        taskType: 'watering',
        intervalDays: 3,
        hour: null,
        minute: null,
        enabled: false,
      });
      prisma.plantSchedule.delete.mockResolvedValue({});
      // Read back after the delete: no override left, so the inherited
      // three-day interval decides.
      prisma.defaultSchedule.findMany.mockResolvedValue(defaultRows);
      prisma.plantSchedule.findMany.mockResolvedValue([]);
      prisma.task.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
        status: 'done',
        completedAt: new Date('2024-01-05T09:00:00Z'),
        updatedAt: new Date('2024-01-05T09:00:00Z'),
      });

      await service.removePlantSchedule('plant-1', 'watering');

      const dueAt: Date = prisma.task.create.mock.calls[0][0].data.dueAt;
      expect(dueAt.getUTCDate()).toBe(1);
      expect(dueAt.getUTCMonth()).toBe(5);

      vi.useRealTimers();
    });

    it('creates nothing when the override was already on', async () => {
      prisma.plantSchedule.findUnique.mockResolvedValue({
        plantId: 'plant-1',
        taskType: 'watering',
        intervalDays: 3,
        hour: null,
        minute: null,
        enabled: true,
      });
      prisma.plantSchedule.delete.mockResolvedValue({});

      await service.removePlantSchedule('plant-1', 'watering');

      expect(prisma.task.create).not.toHaveBeenCalled();
    });
  });

  describe('setPlantSchedule', () => {
    describe('turning a task type back on', () => {
      const disabled = {
        plantId: 'plant-1',
        taskType: 'watering',
        intervalDays: 3,
        hour: null,
        minute: null,
        enabled: false,
      };

      const reEnable = () =>
        service.setPlantSchedule('plant-1', 'watering', {
          intervalDays: 3,
          hour: null,
          minute: null,
          enabled: true,
        });

      beforeEach(() => {
        vi.setSystemTime(new Date('2024-06-01T14:00:00Z'));
        prisma.plantSchedule.findUnique.mockResolvedValue(disabled);
        prisma.plantSchedule.upsert.mockResolvedValue({
          ...disabled,
          enabled: true,
        });
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('owes the work today, not back when it was switched off', async () => {
        prisma.task.findFirst
          // Nothing queued...
          .mockResolvedValueOnce(null)
          // ...and the last watering was months ago, before it went quiet.
          .mockResolvedValueOnce({
            id: 'task-old',
            status: 'done',
            completedAt: new Date('2024-01-05T09:00:00Z'),
            updatedAt: new Date('2024-01-05T09:00:00Z'),
          });

        await reEnable();

        const dueAt: Date = prisma.task.create.mock.calls[0][0].data.dueAt;
        expect(dueAt.getUTCFullYear()).toBe(2024);
        expect(dueAt.getUTCMonth()).toBe(5); // June
        expect(dueAt.getUTCDate()).toBe(1);
        expect(dueAt.getUTCHours()).toBe(9); // DEFAULT_DUE_TIME
      });

      it('stamps the due time the plant pins, when it pins one', async () => {
        prisma.plantSchedule.upsert.mockResolvedValue({
          ...disabled,
          hour: 7,
          minute: 30,
          enabled: true,
        });
        prisma.task.findFirst
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            status: 'done',
            completedAt: new Date('2024-01-05T09:00:00Z'),
            updatedAt: new Date('2024-01-05T09:00:00Z'),
          });

        await service.setPlantSchedule('plant-1', 'watering', {
          intervalDays: 3,
          hour: 7,
          minute: 30,
          enabled: true,
        });

        const dueAt: Date = prisma.task.create.mock.calls[0][0].data.dueAt;
        expect(dueAt.getUTCHours()).toBe(7);
        expect(dueAt.getUTCMinutes()).toBe(30);
      });

      it('creates nothing when it was off for less than its own interval', async () => {
        prisma.task.findFirst
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            status: 'done',
            // A day ago, against a three-day interval: genuinely not due yet.
            completedAt: new Date('2024-05-31T14:00:00Z'),
            updatedAt: new Date('2024-05-31T14:00:00Z'),
          });

        await reEnable();

        expect(prisma.task.create).not.toHaveBeenCalled();
      });

      it('leaves a plant with no history to the scheduler', async () => {
        prisma.task.findFirst.mockResolvedValue(null);

        await reEnable();

        expect(prisma.task.create).not.toHaveBeenCalled();
      });

      it('respects the one-pending-per-task-type invariant', async () => {
        prisma.task.findFirst.mockResolvedValueOnce({ id: 'task-queued' });

        await reEnable();

        expect(prisma.task.create).not.toHaveBeenCalled();
      });

      it('does nothing for a schedule that was already on', async () => {
        prisma.plantSchedule.findUnique.mockResolvedValue({
          ...disabled,
          enabled: true,
        });

        await reEnable();

        expect(prisma.task.create).not.toHaveBeenCalled();
      });
    });

    it('clears the minute alongside a cleared hour', async () => {
      await service.setPlantSchedule('plant-1', 'watering', {
        intervalDays: 3,
        hour: null,
        minute: 30,
      });

      expect(prisma.plantSchedule.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { intervalDays: 3, hour: null, minute: null, enabled: true },
        }),
      );
    });

    it('drops the queued tasks when a task type is turned off', async () => {
      await service.setPlantSchedule('plant-1', 'misting', {
        intervalDays: 2,
        hour: null,
        minute: null,
        enabled: false,
      });

      expect(prisma.task.deleteMany).toHaveBeenCalledWith({
        where: {
          plantId: 'plant-1',
          taskType: 'misting',
          status: { in: ['pending', 'snoozed'] },
        },
      });
    });

    it('leaves history alone \u2014 only unaddressed tasks go', async () => {
      await service.setPlantSchedule('plant-1', 'misting', {
        intervalDays: 2,
        hour: null,
        minute: null,
        enabled: false,
      });

      const where = prisma.task.deleteMany.mock.calls[0][0].where;
      expect(where.status.in).not.toContain('done');
      expect(where.status.in).not.toContain('skipped');
    });

    it('does not touch tasks when the schedule stays on', async () => {
      await service.setPlantSchedule('plant-1', 'watering', {
        intervalDays: 5,
        hour: null,
        minute: null,
      });

      expect(prisma.task.deleteMany).not.toHaveBeenCalled();
    });

    it('keeps a task type off when only the interval is edited', async () => {
      prisma.plantSchedule.findUnique.mockResolvedValue({
        plantId: 'plant-1',
        taskType: 'misting',
        intervalDays: 2,
        hour: null,
        minute: null,
        enabled: false,
      });

      await service.setPlantSchedule('plant-1', 'misting', {
        intervalDays: 4,
        hour: null,
        minute: null,
      });

      expect(prisma.plantSchedule.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ enabled: false }),
        }),
      );
    });

    it('rejects an out-of-range override', async () => {
      await expect(
        service.setPlantSchedule('plant-1', 'watering', {
          intervalDays: 3,
          hour: 25,
          minute: 0,
        }),
      ).rejects.toThrow();
    });
  });
});

describe('resolveNotificationTime', () => {
  const user = {
    base: { hour: 21, minute: 0 },
    overrides: { watering: { hour: 7, minute: 15 } },
  };

  const noPlantTime = { hour: null, minute: null };

  it("uses the user's base time by default", () => {
    expect(resolveNotificationTime(noPlantTime, user, 'fertilization')).toEqual(
      {
        hour: 21,
        minute: 0,
      },
    );
  });

  it("prefers the user's override for that task type", () => {
    expect(resolveNotificationTime(noPlantTime, user, 'watering')).toEqual({
      hour: 7,
      minute: 15,
    });
  });

  it('lets a time pinned on the plant win over both', () => {
    // The owner has decided this plant is watered at 06:00; pinging a
    // collaborator at 21:00 about it would be pointless.
    expect(
      resolveNotificationTime({ hour: 6, minute: 0 }, user, 'watering'),
    ).toEqual({ hour: 6, minute: 0 });
  });

  it('treats a pinned midnight as a real time, not as unset', () => {
    expect(
      resolveNotificationTime({ hour: 0, minute: 0 }, user, 'watering'),
    ).toEqual({ hour: 0, minute: 0 });
  });
});
