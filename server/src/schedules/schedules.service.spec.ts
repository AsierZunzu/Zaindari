import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { SchedulesService } from './schedules.service.js';
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
  };

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

      // Check watering defaults
      expect(prisma.defaultSchedule.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { taskType: 'watering' },
          create: expect.objectContaining({
            taskType: 'watering',
            intervalDays: 3,
            hour: 8,
            minute: 0,
          }),
        }),
      );

      // Check fertilization defaults
      expect(prisma.defaultSchedule.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { taskType: 'fertilization' },
          create: expect.objectContaining({
            intervalDays: 30,
            hour: 9,
          }),
        }),
      );

      // Check misting defaults
      expect(prisma.defaultSchedule.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { taskType: 'misting' },
          create: expect.objectContaining({
            intervalDays: 2,
            hour: 8,
          }),
        }),
      );

      // Check repotting defaults
      expect(prisma.defaultSchedule.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { taskType: 'repotting' },
          create: expect.objectContaining({
            intervalDays: 365,
            hour: 10,
          }),
        }),
      );
    });
  });

  describe('getMergedSchedules', () => {
    it('should return defaults when no overrides exist', async () => {
      prisma.defaultSchedule.findMany.mockResolvedValue([
        { taskType: 'watering', intervalDays: 3, hour: 8, minute: 0 },
        { taskType: 'fertilization', intervalDays: 30, hour: 9, minute: 0 },
        { taskType: 'misting', intervalDays: 2, hour: 8, minute: 0 },
        { taskType: 'repotting', intervalDays: 365, hour: 10, minute: 0 },
      ]);
      prisma.plantSchedule.findMany.mockResolvedValue([]);

      const result = await service.getMergedSchedules('plant-1');

      expect(result).toHaveLength(4);
      expect(result.every((s) => !s.isOverride)).toBe(true);
      expect(result.every((s) => s.enabled)).toBe(true);

      const watering = result.find((s) => s.taskType === 'watering');
      expect(watering).toEqual({
        taskType: 'watering',
        intervalDays: 3,
        hour: 8,
        minute: 0,
        isOverride: false,
        enabled: true,
      });
    });

    it('should use plant override when it exists', async () => {
      prisma.defaultSchedule.findMany.mockResolvedValue([
        { taskType: 'watering', intervalDays: 3, hour: 8, minute: 0 },
        { taskType: 'fertilization', intervalDays: 30, hour: 9, minute: 0 },
        { taskType: 'misting', intervalDays: 2, hour: 8, minute: 0 },
        { taskType: 'repotting', intervalDays: 365, hour: 10, minute: 0 },
      ]);
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

      const watering = result.find((s) => s.taskType === 'watering');
      expect(watering).toEqual({
        taskType: 'watering',
        intervalDays: 1,
        hour: 7,
        minute: 30,
        isOverride: true,
        enabled: true,
      });

      const fertilization = result.find((s) => s.taskType === 'fertilization');
      expect(fertilization?.isOverride).toBe(false);
      expect(fertilization?.intervalDays).toBe(30);
    });

    it('should reflect disabled overrides', async () => {
      prisma.defaultSchedule.findMany.mockResolvedValue([
        { taskType: 'watering', intervalDays: 3, hour: 8, minute: 0 },
        { taskType: 'fertilization', intervalDays: 30, hour: 9, minute: 0 },
        { taskType: 'misting', intervalDays: 2, hour: 8, minute: 0 },
        { taskType: 'repotting', intervalDays: 365, hour: 10, minute: 0 },
      ]);
      prisma.plantSchedule.findMany.mockResolvedValue([
        {
          plantId: 'plant-1',
          taskType: 'misting',
          intervalDays: 2,
          hour: 8,
          minute: 0,
          enabled: false,
        },
      ]);

      const result = await service.getMergedSchedules('plant-1');

      const misting = result.find((s) => s.taskType === 'misting');
      expect(misting?.enabled).toBe(false);
      expect(misting?.isOverride).toBe(true);
    });
  });
});
