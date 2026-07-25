import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { SchedulerService } from './scheduler.service.js';
import { SchedulesService } from '../schedules/schedules.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushService } from '../push/push.service.js';

// A bare `vi.fn()` infers a void-returning mock, so handing mockImplementation
// an async function reads as a floating promise. Naming the signature once says
// these mocks stand in for Prisma methods, which resolve values.
type MockFn = Mock<(...args: any[]) => any>;

describe('SchedulerService', () => {
  let service: SchedulerService;
  let schedulesService: {
    getMergedSchedules: MockFn;
    getUserNotificationTimes: MockFn;
  };
  let pushService: { sendNotification: MockFn };
  let prisma: {
    plant: {
      findMany: MockFn;
      findUnique: MockFn;
    };
    task: {
      findFirst: MockFn;
      findMany: MockFn;
      create: MockFn;
      updateMany: MockFn;
    };
    taskNotification: {
      create: MockFn;
    };
  };

  // No plant pins a time, so every reminder follows its recipient's own.
  const mockSchedules = [
    {
      taskType: 'watering',
      intervalDays: 3,
      hour: null,
      minute: null,
      isOverride: false,
      enabled: true,
    },
    {
      taskType: 'fertilization',
      intervalDays: 30,
      hour: null,
      minute: null,
      isOverride: false,
      enabled: true,
    },
    {
      taskType: 'misting',
      intervalDays: 2,
      hour: null,
      minute: null,
      isOverride: false,
      enabled: true,
    },
    {
      taskType: 'repotting',
      intervalDays: 365,
      hour: null,
      minute: null,
      isOverride: false,
      enabled: true,
    },
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
        // The notification dispatch phase; individual tests override it.
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        updateMany: vi.fn(),
      },
      taskNotification: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    schedulesService = {
      getMergedSchedules: vi.fn().mockResolvedValue(mockSchedules),
      getUserNotificationTimes: vi
        .fn()
        .mockResolvedValue({ base: { hour: 9, minute: 0 }, overrides: {} }),
    };

    pushService = {
      sendNotification: vi.fn().mockResolvedValue(undefined),
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

    it('should not notify at task creation time', async () => {
      prisma.plant.findMany.mockResolvedValue([{ id: 'plant-1' }]);
      prisma.task.updateMany.mockResolvedValue({ count: 0 });
      prisma.task.findFirst.mockResolvedValue(null);
      prisma.task.create.mockResolvedValue({});

      await service.evaluateTasks();

      // Creating a task is not what sends the reminder — the dispatch phase
      // does, once each recipient's own time has arrived.
      expect(prisma.task.create).toHaveBeenCalledTimes(4);
      expect(pushService.sendNotification).not.toHaveBeenCalled();
    });
  });

  describe('seedTasksForPlants', () => {
    it('creates the first task for each given plant without scanning them all', async () => {
      prisma.task.updateMany.mockResolvedValue({ count: 0 });
      prisma.task.findFirst.mockResolvedValue(null); // no pending, no history
      prisma.task.create.mockResolvedValue({});

      await service.seedTasksForPlants(['plant-1']);

      // Scoped to the ids it was handed, not a full-table scan.
      expect(prisma.plant.findMany).not.toHaveBeenCalled();
      expect(prisma.task.create).toHaveBeenCalledTimes(4);
      expect(prisma.task.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          plantId: 'plant-1',
          taskType: 'watering',
          status: 'pending',
        }),
      });
    });

    it('honours the one-pending-per-plant invariant', async () => {
      prisma.task.updateMany.mockResolvedValue({ count: 0 });
      // A pending task already exists for every task type.
      prisma.task.findFirst.mockResolvedValue({
        id: 'task-1',
        status: 'pending',
      });

      await service.seedTasksForPlants(['plant-1']);

      expect(prisma.task.create).not.toHaveBeenCalled();
    });

    it('does nothing for an empty list', async () => {
      await service.seedTasksForPlants([]);

      expect(schedulesService.getMergedSchedules).not.toHaveBeenCalled();
      expect(prisma.task.create).not.toHaveBeenCalled();
    });
  });

  describe('notification dispatch', () => {
    const owner = { id: 'owner-1', locale: 'en' };
    const collaborator = { id: 'user-2', locale: 'es' };

    /** A pending task on a plant, optionally shared, optionally notified. */
    function pendingTask(overrides: Record<string, unknown> = {}) {
      return {
        id: 'task-1',
        plantId: 'plant-1',
        taskType: 'watering',
        createdAt: new Date('2024-06-10T02:14:00Z'),
        dueAt: new Date('2024-06-10T02:14:00Z'),
        notifications: [],
        plant: { name: 'Ficus', owner, shares: [] },
        ...overrides,
      };
    }

    /** A tick with no plants, so only the dispatch phase does anything. */
    async function tick(tasks: Array<Record<string, unknown>>, now: Date) {
      vi.setSystemTime(now);
      prisma.plant.findMany.mockResolvedValue([]);
      prisma.task.findMany.mockResolvedValue(tasks);
      await service.evaluateTasks();
    }

    it("holds the reminder until the recipient's own time", async () => {
      await tick([pendingTask()], new Date('2024-06-10T08:59:00Z'));

      expect(pushService.sendNotification).not.toHaveBeenCalled();
      expect(prisma.taskNotification.create).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('sends the reminder once that time arrives', async () => {
      await tick([pendingTask()], new Date('2024-06-10T09:00:00Z'));

      expect(pushService.sendNotification).toHaveBeenCalledWith(
        'owner-1',
        expect.objectContaining({ url: '/plants/plant-1' }),
      );
      expect(prisma.taskNotification.create).toHaveBeenCalledWith({
        data: {
          taskId: 'task-1',
          userId: 'owner-1',
          notifiedAt: expect.any(Date),
        },
      });

      vi.useRealTimers();
    });

    it('reminds two collaborators at their own separate times', async () => {
      schedulesService.getUserNotificationTimes.mockImplementation(
        (userId: string) =>
          Promise.resolve(
            userId === 'owner-1'
              ? { base: { hour: 9, minute: 0 }, overrides: {} }
              : { base: { hour: 21, minute: 0 }, overrides: {} },
          ),
      );

      const shared = pendingTask({
        plant: { name: 'Ficus', owner, shares: [{ user: collaborator }] },
      });

      // 09:00 is the owner's time; the collaborator is not due until 21:00.
      await tick([shared], new Date('2024-06-10T09:00:00Z'));
      expect(pushService.sendNotification).toHaveBeenCalledTimes(1);
      expect(pushService.sendNotification).toHaveBeenCalledWith(
        'owner-1',
        expect.anything(),
      );

      // The owner is latched by now, so only the collaborator is left.
      vi.clearAllMocks();
      await tick(
        [
          {
            ...shared,
            notifications: [{ userId: 'owner-1' }],
          },
        ],
        new Date('2024-06-10T21:00:00Z'),
      );
      expect(pushService.sendNotification).toHaveBeenCalledTimes(1);
      expect(pushService.sendNotification).toHaveBeenCalledWith(
        'user-2',
        expect.anything(),
      );

      vi.useRealTimers();
    });

    it('never reminds the same person about the same task twice', async () => {
      await tick(
        [pendingTask({ notifications: [{ userId: 'owner-1' }] })],
        new Date('2024-06-10T09:00:00Z'),
      );

      expect(pushService.sendNotification).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it("applies the user's per-task-type time over their base time", async () => {
      schedulesService.getUserNotificationTimes.mockResolvedValue({
        base: { hour: 21, minute: 0 },
        overrides: { watering: { hour: 7, minute: 0 } },
      });

      await tick([pendingTask()], new Date('2024-06-10T07:00:00Z'));

      expect(pushService.sendNotification).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('lets a time pinned on the plant beat every preference', async () => {
      schedulesService.getMergedSchedules.mockResolvedValue(
        mockSchedules.map((s) =>
          s.taskType === 'watering' ? { ...s, hour: 6, minute: 0 } : s,
        ),
      );
      schedulesService.getUserNotificationTimes.mockResolvedValue({
        base: { hour: 21, minute: 0 },
        overrides: { watering: { hour: 7, minute: 0 } },
      });

      await tick([pendingTask()], new Date('2024-06-10T06:00:00Z'));

      expect(pushService.sendNotification).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('waits for the next day when the task appears after the time has passed', async () => {
      const afternoon = pendingTask({
        createdAt: new Date('2024-06-10T14:00:00Z'),
        dueAt: new Date('2024-06-10T14:00:00Z'),
      });

      await tick([afternoon], new Date('2024-06-10T23:59:00Z'));
      expect(pushService.sendNotification).not.toHaveBeenCalled();

      await tick([afternoon], new Date('2024-06-11T09:00:00Z'));
      expect(pushService.sendNotification).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('does not notify a follow-up task before it is due', async () => {
      // TasksService.complete() creates the next task immediately with a dueAt
      // one interval out; anchoring on createdAt would push days early.
      const followUp = pendingTask({
        createdAt: new Date('2024-06-10T14:00:00Z'),
        dueAt: new Date('2024-06-13T09:00:00Z'),
      });

      await tick([followUp], new Date('2024-06-11T09:00:00Z'));
      expect(pushService.sendNotification).not.toHaveBeenCalled();

      await tick([followUp], new Date('2024-06-13T09:00:00Z'));
      expect(pushService.sendNotification).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('latches even when the push fails, so it cannot loop', async () => {
      pushService.sendNotification.mockRejectedValue(
        new Error('endpoint gone'),
      );

      await tick([pendingTask()], new Date('2024-06-10T09:00:00Z'));

      expect(prisma.taskNotification.create).toHaveBeenCalledWith({
        data: {
          taskId: 'task-1',
          userId: 'owner-1',
          notifiedAt: expect.any(Date),
        },
      });

      vi.useRealTimers();
    });

    it('skips tasks whose schedule is disabled', async () => {
      schedulesService.getMergedSchedules.mockResolvedValue(
        mockSchedules.map((s) => ({
          ...s,
          enabled: s.taskType !== 'watering',
        })),
      );

      await tick([pendingTask()], new Date('2024-06-10T09:00:00Z'));

      expect(pushService.sendNotification).not.toHaveBeenCalled();
      expect(prisma.taskNotification.create).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('notifies an owner who also holds a share exactly once', async () => {
      await tick(
        [
          pendingTask({
            plant: { name: 'Ficus', owner, shares: [{ user: owner }] },
          }),
        ],
        new Date('2024-06-10T09:00:00Z'),
      );

      expect(pushService.sendNotification).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('still notifies the others when one recipient fails', async () => {
      pushService.sendNotification.mockRejectedValueOnce(
        new Error('push endpoint gone'),
      );

      await tick(
        [
          pendingTask({
            plant: { name: 'Ficus', owner, shares: [{ user: collaborator }] },
          }),
        ],
        new Date('2024-06-10T09:00:00Z'),
      );

      expect(pushService.sendNotification).toHaveBeenCalledTimes(2);
      expect(prisma.taskNotification.create).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it('sends each recipient their own language', async () => {
      await tick(
        [
          pendingTask({
            plant: { name: 'Ficus', owner, shares: [{ user: collaborator }] },
          }),
        ],
        new Date('2024-06-10T09:00:00Z'),
      );

      const bodies = pushService.sendNotification.mock.calls.map(
        (call) => call[1].body,
      );
      expect(bodies).toHaveLength(2);
      expect(bodies[0]).not.toEqual(bodies[1]);

      vi.useRealTimers();
    });
  });
});
