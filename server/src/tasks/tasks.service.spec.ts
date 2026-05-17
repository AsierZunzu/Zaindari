import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { TasksService } from './tasks.service.js';
import { SchedulesService } from '../schedules/schedules.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('TasksService', () => {
  let service: TasksService;
  let schedulesService: { getMergedSchedules: ReturnType<typeof vi.fn> };
  let prisma: {
    task: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
  };

  const mockSchedules = [
    { taskType: 'watering', intervalDays: 3, hour: 8, minute: 0, isOverride: false, enabled: true },
    { taskType: 'fertilization', intervalDays: 30, hour: 9, minute: 0, isOverride: false, enabled: true },
    { taskType: 'misting', intervalDays: 2, hour: 8, minute: 0, isOverride: false, enabled: true },
    { taskType: 'repotting', intervalDays: 365, hour: 10, minute: 0, isOverride: false, enabled: true },
  ];

  beforeEach(async () => {
    vi.clearAllMocks();

    prisma = {
      task: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    };

    schedulesService = {
      getMergedSchedules: vi.fn().mockResolvedValue(mockSchedules),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: prisma },
        { provide: SchedulesService, useValue: schedulesService },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
  });

  describe('complete', () => {
    it('should complete a pending task and create next pending task', async () => {
      const now = new Date('2024-06-01T12:00:00Z');
      vi.setSystemTime(now);

      const task = {
        id: 'task-1',
        plantId: 'plant-1',
        taskType: 'watering',
        status: 'pending',
        dueAt: now,
        updatedAt: now,
      };

      prisma.task.findUnique.mockResolvedValue(task);
      prisma.task.update.mockResolvedValue({ ...task, status: 'done', completedAt: now, completedBy: 'user-1' });
      prisma.task.create.mockResolvedValue({});

      const result = await service.complete('task-1', 'user-1');

      expect(result.status).toBe('done');
      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: {
          status: 'done',
          completedAt: expect.any(Date),
          completedBy: 'user-1',
        },
      });

      // Should create next pending task
      expect(prisma.task.create).toHaveBeenCalledWith({
        data: {
          plantId: 'plant-1',
          taskType: 'watering',
          status: 'pending',
          dueAt: expect.any(Date),
        },
      });

      // Verify the next due date is 3 days later at 08:00
      const createCall = prisma.task.create.mock.calls[0][0];
      const nextDueAt: Date = createCall.data.dueAt;
      expect(nextDueAt.getUTCDate()).toBe(now.getUTCDate() + 3);
      expect(nextDueAt.getUTCHours()).toBe(8);
      expect(nextDueAt.getUTCMinutes()).toBe(0);

      vi.useRealTimers();
    });

    it('should throw if task is not pending or snoozed', async () => {
      prisma.task.findUnique.mockResolvedValue({
        id: 'task-1',
        status: 'done',
      });

      await expect(service.complete('task-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if task does not exist', async () => {
      prisma.task.findUnique.mockResolvedValue(null);

      await expect(service.complete('nonexistent', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('undo', () => {
    it('should undo a completed task and delete the auto-created next task', async () => {
      const completedTask = {
        id: 'task-1',
        plantId: 'plant-1',
        taskType: 'watering',
        status: 'done',
        completedAt: new Date(),
        completedBy: 'user-1',
        updatedAt: new Date('2024-06-01T12:00:00Z'),
      };

      const nextTask = {
        id: 'task-2',
        plantId: 'plant-1',
        taskType: 'watering',
        status: 'pending',
        createdAt: new Date('2024-06-01T12:00:01Z'),
      };

      prisma.task.findUnique.mockResolvedValue(completedTask);
      prisma.task.update.mockResolvedValue({
        ...completedTask,
        status: 'pending',
        completedAt: null,
        completedBy: null,
      });
      prisma.task.findFirst.mockResolvedValue(nextTask);
      prisma.task.delete.mockResolvedValue(nextTask);

      const result = await service.undo('task-1');

      expect(result.status).toBe('pending');
      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: {
          status: 'pending',
          completedAt: null,
          completedBy: null,
        },
      });

      // Should delete the auto-created next pending task
      expect(prisma.task.delete).toHaveBeenCalledWith({
        where: { id: 'task-2' },
      });
    });

    it('should throw if task is not done', async () => {
      prisma.task.findUnique.mockResolvedValue({
        id: 'task-1',
        status: 'pending',
      });

      await expect(service.undo('task-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should not fail if no next pending task exists', async () => {
      prisma.task.findUnique.mockResolvedValue({
        id: 'task-1',
        plantId: 'plant-1',
        taskType: 'watering',
        status: 'done',
        updatedAt: new Date(),
      });
      prisma.task.update.mockResolvedValue({
        id: 'task-1',
        status: 'pending',
        completedAt: null,
        completedBy: null,
      });
      prisma.task.findFirst.mockResolvedValue(null);

      const result = await service.undo('task-1');
      expect(result.status).toBe('pending');
      expect(prisma.task.delete).not.toHaveBeenCalled();
    });
  });

  describe('snooze', () => {
    it('should snooze a task for the given hours', async () => {
      const now = new Date('2024-06-01T12:00:00Z');
      vi.setSystemTime(now);

      prisma.task.findUnique.mockResolvedValue({
        id: 'task-1',
        status: 'pending',
      });

      const snoozedTask = {
        id: 'task-1',
        status: 'snoozed',
        snoozeUntil: new Date('2024-06-01T14:00:00Z'),
      };
      prisma.task.update.mockResolvedValue(snoozedTask);

      const result = await service.snooze('task-1', { hours: 2 });

      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: {
          status: 'snoozed',
          snoozeUntil: expect.any(Date),
        },
      });

      const updateCall = prisma.task.update.mock.calls[0][0];
      const snoozeUntil: Date = updateCall.data.snoozeUntil;
      expect(snoozeUntil.getTime()).toBe(now.getTime() + 2 * 60 * 60 * 1000);

      vi.useRealTimers();
    });

    it('should throw NotFoundException if task does not exist', async () => {
      prisma.task.findUnique.mockResolvedValue(null);

      await expect(service.snooze('nonexistent', { hours: 1 })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('skip', () => {
    it('should skip a task and create the next pending task', async () => {
      const now = new Date('2024-06-01T12:00:00Z');
      vi.setSystemTime(now);

      prisma.task.findUnique.mockResolvedValue({
        id: 'task-1',
        plantId: 'plant-1',
        taskType: 'watering',
        status: 'pending',
      });

      prisma.task.update.mockResolvedValue({
        id: 'task-1',
        status: 'skipped',
        skipReason: 'On vacation',
      });
      prisma.task.create.mockResolvedValue({});

      const result = await service.skip('task-1', { reason: 'On vacation' }, 'user-1');

      expect(result.status).toBe('skipped');
      expect(prisma.task.create).toHaveBeenCalledWith({
        data: {
          plantId: 'plant-1',
          taskType: 'watering',
          status: 'pending',
          dueAt: expect.any(Date),
        },
      });

      vi.useRealTimers();
    });
  });
});
