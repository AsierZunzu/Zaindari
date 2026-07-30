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
    {
      taskType: 'watering',
      intervalDays: 3,
      hour: 8,
      minute: 0,
      isOverride: false,
      enabled: true,
    },
    {
      taskType: 'fertilization',
      intervalDays: 30,
      hour: 9,
      minute: 0,
      isOverride: false,
      enabled: true,
    },
    {
      taskType: 'misting',
      intervalDays: 2,
      hour: 8,
      minute: 0,
      isOverride: false,
      enabled: true,
    },
    {
      taskType: 'repotting',
      intervalDays: 365,
      hour: 10,
      minute: 0,
      isOverride: false,
      enabled: true,
    },
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
      prisma.task.update.mockResolvedValue({
        ...task,
        status: 'done',
        completedAt: now,
        completedBy: 'user-1',
      });
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

    it('should not create a follow-up for a task type that is turned off', async () => {
      const now = new Date('2024-06-01T12:00:00Z');
      vi.setSystemTime(now);

      schedulesService.getMergedSchedules.mockResolvedValue(
        mockSchedules.map((s) =>
          s.taskType === 'watering' ? { ...s, enabled: false } : s,
        ),
      );

      const task = {
        id: 'task-1',
        plantId: 'plant-1',
        taskType: 'watering',
        status: 'pending',
        dueAt: now,
        updatedAt: now,
      };
      prisma.task.findUnique.mockResolvedValue(task);
      prisma.task.update.mockResolvedValue({ ...task, status: 'done' });

      const result = await service.complete('task-1', 'user-1');

      // The completion itself is still recorded \u2014 it is history.
      expect(result.status).toBe('done');
      expect(prisma.task.create).not.toHaveBeenCalled();

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

      await expect(service.undo('task-1')).rejects.toThrow(BadRequestException);
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

      await service.snooze('task-1', { hours: 2 });

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
      });
      prisma.task.create.mockResolvedValue({});

      const result = await service.skip('task-1', 'user-1');

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

  describe('getTasksForUser', () => {
    const from = new Date('2026-07-01T00:00:00Z');
    const to = new Date('2026-07-31T23:59:59Z');

    function whereOf() {
      return prisma.task.findMany.mock.calls[0][0].where;
    }

    it('should only match plants the user owns or has been shared', async () => {
      prisma.task.findMany.mockResolvedValue([]);

      await service.getTasksForUser('user-1');

      expect(whereOf().plant).toEqual({
        OR: [{ ownerId: 'user-1' }, { shares: { some: { userId: 'user-1' } } }],
      });
    });

    it('should return tasks with their plant so the agenda can label them', async () => {
      const image = { id: 'image-1', plantId: 'plant-1', isCurrent: true };
      prisma.task.findMany.mockResolvedValue([
        {
          id: 'task-1',
          taskType: 'watering',
          plant: {
            id: 'plant-1',
            name: 'Monstera',
            location: 'Kitchen',
            images: [image],
          },
        },
      ]);

      const result = await service.getTasksForUser('user-1');

      // The one-element `images` array is flattened to `currentImage`, the
      // shape the client declares -- the agenda renders it as a thumbnail.
      expect(result).toEqual([
        {
          id: 'task-1',
          taskType: 'watering',
          plant: {
            id: 'plant-1',
            name: 'Monstera',
            location: 'Kitchen',
            currentImage: image,
          },
        },
      ]);
      expect(prisma.task.findMany.mock.calls[0][0]).toMatchObject({
        include: {
          plant: {
            select: {
              id: true,
              name: true,
              location: true,
              images: { where: { isCurrent: true }, take: 1 },
            },
          },
        },
        orderBy: { dueAt: 'asc' },
      });
    });

    it('should report a plant with no photo as a null currentImage', async () => {
      prisma.task.findMany.mockResolvedValue([
        {
          id: 'task-1',
          plant: {
            id: 'plant-1',
            name: 'Monstera',
            location: null,
            images: [],
          },
        },
      ]);

      const result = await service.getTasksForUser('user-1');

      expect(result[0].plant.currentImage).toBeNull();
    });

    it('should constrain the due window when from and to are given', async () => {
      prisma.task.findMany.mockResolvedValue([]);

      await service.getTasksForUser('user-1', { from, to });

      expect(whereOf().dueAt).toEqual({ gte: from, lte: to });
      expect(whereOf().OR).toBeUndefined();
    });

    it('should filter by the requested statuses', async () => {
      prisma.task.findMany.mockResolvedValue([]);

      await service.getTasksForUser('user-1', {
        statuses: ['pending', 'done'],
      });

      expect(whereOf().status).toEqual({ in: ['pending', 'done'] });
    });

    it('should also match still-actionable tasks before the window when includeOverdue is set', async () => {
      prisma.task.findMany.mockResolvedValue([]);

      await service.getTasksForUser('user-1', {
        from,
        to,
        includeOverdue: true,
      });

      expect(whereOf().OR).toEqual([
        { dueAt: { gte: from, lte: to } },
        { dueAt: { lt: from }, status: { in: ['pending', 'snoozed'] } },
      ]);
    });

    it('should not widen the window for overdue tasks when includeOverdue is off', async () => {
      prisma.task.findMany.mockResolvedValue([]);

      await service.getTasksForUser('user-1', {
        from,
        to,
        includeOverdue: false,
      });

      expect(whereOf().OR).toBeUndefined();
      expect(whereOf().dueAt).toEqual({ gte: from, lte: to });
    });
  });
});
