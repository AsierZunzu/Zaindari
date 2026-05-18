import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { SchedulerService } from './scheduler.service.js';
import { SchedulesService } from '../schedules/schedules.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushService } from '../push/push.service.js';

describe('SchedulerService', () => {
  let service: SchedulerService;
  let schedulesService: { getMergedSchedules: ReturnType<typeof vi.fn> };
  let pushService: { notifyPlantCollaborators: ReturnType<typeof vi.fn> };
  let prisma: {
    plant: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
    };
    task: {
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
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
      plant: {
        findMany: vi.fn(),
        findUnique: vi.fn().mockResolvedValue({ name: 'Test Plant' }),
      },
      task: {
        findFirst: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
      },
    };

    schedulesService = {
      getMergedSchedules: vi.fn().mockResolvedValue(mockSchedules),
    };

    pushService = {
      notifyPlantCollaborators: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulerService,
        { provide: PrismaService, useValue: prisma },
        { provide: SchedulesService, useValue: schedulesService },
        { provide: PushService, useValue: pushService },
      ],
    }).compile();

    service = module.get<SchedulerService>(SchedulerService);
  });

  describe('evaluateTasks', () => {
    it('should create initial tasks when no tasks exist for a plant', async () => {
      prisma.plant.findMany.mockResolvedValue([{ id: 'plant-1' }]);
      prisma.task.updateMany.mockResolvedValue({ count: 0 });
      prisma.task.findFirst.mockResolvedValue(null); // no existing pending, no latest
      prisma.task.create.mockResolvedValue({});

      await service.evaluateTasks();

      // Should create 4 tasks (one per task type)
      expect(prisma.task.create).toHaveBeenCalledTimes(4);

      // Verify a watering task was created
      expect(prisma.task.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          plantId: 'plant-1',
          taskType: 'watering',
          status: 'pending',
        }),
      });
    });

    it('should not create duplicate pending tasks', async () => {
      prisma.plant.findMany.mockResolvedValue([{ id: 'plant-1' }]);
      prisma.task.updateMany.mockResolvedValue({ count: 0 });

      // First call for each taskType: findFirst for existing pending (return pending task)
      prisma.task.findFirst.mockResolvedValue({
        id: 'task-1',
        plantId: 'plant-1',
        taskType: 'watering',
        status: 'pending',
        dueAt: new Date(),
      });

      await service.evaluateTasks();

      // Should NOT create any tasks since all have pending
      expect(prisma.task.create).not.toHaveBeenCalled();
    });

    it('should create new task when enough time has passed since completion', async () => {
      const now = new Date('2024-06-10T12:00:00Z');
      vi.setSystemTime(now);

      prisma.plant.findMany.mockResolvedValue([{ id: 'plant-1' }]);
      prisma.task.updateMany.mockResolvedValue({ count: 0 });

      // No pending task exists
      let findFirstCallCount = 0;
      prisma.task.findFirst.mockImplementation(() => {
        findFirstCallCount++;
        // Odd calls = checking for pending (return null)
        // Even calls = checking for latest task
        if (findFirstCallCount % 2 === 1) {
          return Promise.resolve(null);
        }
        // Return a completed task from 5 days ago (watering interval is 3)
        return Promise.resolve({
          id: 'task-old',
          plantId: 'plant-1',
          taskType: 'watering',
          status: 'done',
          completedAt: new Date('2024-06-05T12:00:00Z'),
          updatedAt: new Date('2024-06-05T12:00:00Z'),
          createdAt: new Date('2024-06-01T08:00:00Z'),
        });
      });
      prisma.task.create.mockResolvedValue({});

      await service.evaluateTasks();

      // Should create tasks for each type since all have old completions
      expect(prisma.task.create).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should skip disabled schedules', async () => {
      const disabledSchedules = mockSchedules.map((s) =>
        s.taskType === 'misting' ? { ...s, enabled: false } : s,
      );
      schedulesService.getMergedSchedules.mockResolvedValue(disabledSchedules);

      prisma.plant.findMany.mockResolvedValue([{ id: 'plant-1' }]);
      prisma.task.updateMany.mockResolvedValue({ count: 0 });
      prisma.task.findFirst.mockResolvedValue(null);
      prisma.task.create.mockResolvedValue({});

      await service.evaluateTasks();

      // Should create tasks for 3 task types (not misting)
      expect(prisma.task.create).toHaveBeenCalledTimes(3);
      const createdTaskTypes = prisma.task.create.mock.calls.map(
        (call) => call[0].data.taskType,
      );
      expect(createdTaskTypes).not.toContain('misting');
    });

    it('should un-snooze tasks when snoozeUntil has passed', async () => {
      prisma.plant.findMany.mockResolvedValue([{ id: 'plant-1' }]);
      prisma.task.updateMany.mockResolvedValue({ count: 1 });
      prisma.task.findFirst.mockResolvedValue({
        id: 'task-1',
        status: 'pending',
      });

      await service.evaluateTasks();

      // Should have called updateMany for snoozed tasks
      expect(prisma.task.updateMany).toHaveBeenCalled();
    });
  });
});
