import { describe, it, expect, vi, beforeEach } from 'vitest';
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
      upsert: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
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
        upsert: vi.fn(),
        delete: vi.fn(),
      },
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

  describe('setPlantSchedule', () => {
    it('clears the minute alongside a cleared hour', async () => {
      await service.setPlantSchedule('plant-1', 'watering', {
        intervalDays: 3,
        hour: null,
        minute: 30,
      });

      expect(prisma.plantSchedule.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { intervalDays: 3, hour: null, minute: null },
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
    expect(resolveNotificationTime(noPlantTime, user, 'fertilization')).toEqual({
      hour: 21,
      minute: 0,
    });
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
