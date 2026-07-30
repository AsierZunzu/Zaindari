import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { TaskType, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  SchedulesService,
  DEFAULT_DUE_TIME,
} from '../schedules/schedules.service.js';
import { apiError, ERROR_CODES } from '../common/errors/api-error.js';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulesService: SchedulesService,
  ) {}

  async getTasksForPlant(
    plantId: string,
    options?: { status?: TaskStatus; limit?: number },
  ) {
    return this.prisma.task.findMany({
      where: {
        plantId,
        ...(options?.status ? { status: options.status } : {}),
      },
      orderBy: { dueAt: 'desc' },
      ...(options?.limit ? { take: options.limit } : {}),
    });
  }

  /**
   * Every task across the plants a user owns or has been shared, within a due
   * date window. Unlike the per-plant endpoints there is no guard to lean on,
   * so the access rule lives in the query itself.
   *
   * `includeOverdue` additionally pulls in still-actionable tasks that fell due
   * before the window: an agenda that silently hides work you already missed is
   * worse than useless. The calendar leaves it off, because a plant you forgot
   * in March has no business appearing in July's grid.
   */
  async getTasksForUser(
    userId: string,
    options: {
      from?: Date;
      to?: Date;
      statuses?: TaskStatus[];
      includeOverdue?: boolean;
    } = {},
  ) {
    const { from, to, statuses, includeOverdue } = options;

    const dueWindow =
      from || to
        ? {
            dueAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {};

    const overdueOutsideWindow =
      includeOverdue && from
        ? [
            {
              dueAt: { lt: from },
              status: { in: ['pending', 'snoozed'] as TaskStatus[] },
            },
          ]
        : [];

    const tasks = await this.prisma.task.findMany({
      where: {
        plant: {
          OR: [{ ownerId: userId }, { shares: { some: { userId } } }],
        },
        ...(statuses?.length ? { status: { in: statuses } } : {}),
        ...(overdueOutsideWindow.length
          ? { OR: [dueWindow, ...overdueOutsideWindow] }
          : dueWindow),
      },
      include: {
        plant: {
          select: {
            id: true,
            name: true,
            location: true,
            // The agenda shows the plant's photo as a thumbnail. Same shape as
            // `toPlantWithImage`: a one-element array is the only way to say
            // "the current one" in a select, and it is flattened below because
            // the client declares a single `currentImage`.
            images: { where: { isCurrent: true }, take: 1 },
          },
        },
      },
      orderBy: { dueAt: 'asc' },
    });

    return tasks.map(({ plant, ...task }) => ({
      ...task,
      plant: {
        id: plant.id,
        name: plant.name,
        location: plant.location,
        currentImage: plant.images[0] ?? null,
      },
    }));
  }

  async complete(taskId: string, userId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException(
        apiError(ERROR_CODES.taskNotFound, 'Task not found'),
      );
    }
    if (task.status !== 'pending' && task.status !== 'snoozed') {
      throw new BadRequestException(
        apiError(
          ERROR_CODES.taskNotCompletable,
          'Task must be pending or snoozed to complete',
        ),
      );
    }

    const mergedSchedules = await this.schedulesService.getMergedSchedules(
      task.plantId,
    );
    const schedule = mergedSchedules.find((s) => s.taskType === task.taskType);

    const now = new Date();
    const completedTask = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'done',
        completedAt: now,
        completedBy: userId,
      },
    });

    // A disabled task type gets no follow-up: the plant's owner has said this
    // is not on the rotation any more, and the completion is only history.
    if (schedule?.enabled) {
      const nextDueAt = this.calculateNextDueAt(
        now,
        schedule.intervalDays,
        schedule.hour,
        schedule.minute,
      );
      await this.prisma.task.create({
        data: {
          plantId: task.plantId,
          taskType: task.taskType,
          status: 'pending',
          dueAt: nextDueAt,
        },
      });
    }

    return completedTask;
  }

  async completeByType(plantId: string, taskType: TaskType, userId: string) {
    let task = await this.prisma.task.findFirst({
      where: {
        plantId,
        taskType,
        status: { in: ['pending', 'snoozed'] },
      },
      orderBy: { dueAt: 'asc' },
    });

    if (!task) {
      const now = new Date();

      task = await this.prisma.task.create({
        data: {
          plantId,
          taskType,
          status: 'pending',
          dueAt: now,
        },
      });
    }

    return this.complete(task.id, userId);
  }

  async undo(taskId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException(
        apiError(ERROR_CODES.taskNotFound, 'Task not found'),
      );
    }
    if (task.status !== 'done') {
      throw new BadRequestException(
        apiError(
          ERROR_CODES.taskNotUndoable,
          'Only completed tasks can be undone',
        ),
      );
    }

    const updatedTask = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'pending',
        completedAt: null,
        completedBy: null,
      },
    });

    // Delete the auto-created next pending task for same plant+taskType
    const nextPending = await this.prisma.task.findFirst({
      where: {
        plantId: task.plantId,
        taskType: task.taskType,
        status: 'pending',
        createdAt: { gte: task.updatedAt },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (nextPending) {
      await this.prisma.task.delete({ where: { id: nextPending.id } });
    }

    return updatedTask;
  }

  /**
   * Postponing moves the due date, it does not just annotate the task.
   *
   * The agenda and the calendar grid bucket by `dueAt` (`utils/agenda.ts`), and
   * `getTasksForUser` filters its window by it too, so a task whose `dueAt`
   * stayed put would keep drawing on the day it was postponed *from* — and
   * would snap back there anyway once `SchedulerService` un-snoozes it and
   * clears `snoozeUntil`. Moving `dueAt` makes every reader agree, including
   * `shouldNotifyNow`, which anchors on `max(createdAt, dueAt)` and so holds
   * the push back by the same lapse.
   *
   * `snoozeUntil` is kept as the un-snooze latch the scheduler watches; the two
   * are the same instant, but they answer different questions.
   */
  async snooze(taskId: string, data: { hours: number }) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException(
        apiError(ERROR_CODES.taskNotFound, 'Task not found'),
      );
    }

    const now = new Date();
    const lapseEnd = new Date(now.getTime() + data.hours * 60 * 60 * 1000);

    const mergedSchedules = await this.schedulesService.getMergedSchedules(
      task.plantId,
    );
    const schedule = mergedSchedules.find((s) => s.taskType === task.taskType);

    const dueAt = this.calculateSnoozedDueAt(
      lapseEnd,
      now,
      schedule?.hour ?? null,
      schedule?.minute ?? null,
    );

    return this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'snoozed',
        // The latch tracks the due date rather than the raw lapse: they answer
        // different questions but not different instants. A `snoozeUntil` left
        // at the raw offset would leave the task drawn on its new day and
        // still labelled snoozed for the rest of that day, and would hold the
        // reminder back past the hour it is now due at — `dispatchNotifications`
        // only considers `pending` tasks.
        snoozeUntil: dueAt,
        dueAt,
      },
    });
  }

  // `_userId` is unused: unlike complete(), skipping records no actor. The
  // parameter stays so the controller's call shape matches complete()'s.
  async skip(taskId: string, _userId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException(
        apiError(ERROR_CODES.taskNotFound, 'Task not found'),
      );
    }

    const mergedSchedules = await this.schedulesService.getMergedSchedules(
      task.plantId,
    );
    const schedule = mergedSchedules.find((s) => s.taskType === task.taskType);

    const now = new Date();
    const skippedTask = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'skipped',
      },
    });

    // A disabled task type gets no follow-up: the plant's owner has said this
    // is not on the rotation any more, and the completion is only history.
    if (schedule?.enabled) {
      const nextDueAt = this.calculateNextDueAt(
        now,
        schedule.intervalDays,
        schedule.hour,
        schedule.minute,
      );
      await this.prisma.task.create({
        data: {
          plantId: task.plantId,
          taskType: task.taskType,
          status: 'pending',
          dueAt: nextDueAt,
        },
      });
    }

    return skippedTask;
  }

  /**
   * A due date is one shared fact about a task, so it falls back to a fixed
   * hour rather than to any collaborator's reminder preference — that only
   * decides when each of them is pushed.
   */
  private calculateNextDueAt(
    from: Date,
    intervalDays: number,
    hour: number | null,
    minute: number | null,
  ): Date {
    const next = new Date(from);
    next.setUTCDate(next.getUTCDate() + intervalDays);
    next.setUTCHours(
      hour ?? DEFAULT_DUE_TIME.hour,
      minute ?? DEFAULT_DUE_TIME.minute,
      0,
      0,
    );
    return next;
  }

  /**
   * The due date a postponed task lands on: the day the lapse reaches, at the
   * hour the plant is scheduled for — not the arbitrary clock time the button
   * happened to be pressed at. Postponing a 08:00 watering by a day makes it
   * due at 08:00, the same as every other occurrence the schedule produces.
   *
   * That means the lapse picks the *day* and the schedule picks the time, so a
   * postponement is not exactly `hours` long. Normalising can also land before
   * the lapse even began — a two-hour postponement at 10:00 against an 08:00
   * schedule — and a task must not come due before it was postponed to, so
   * that case rolls to the next day's occurrence instead.
   *
   * UTC throughout, like every other due-date calculation here.
   */
  private calculateSnoozedDueAt(
    snoozeUntil: Date,
    now: Date,
    hour: number | null,
    minute: number | null,
  ): Date {
    const due = new Date(snoozeUntil);
    due.setUTCHours(
      hour ?? DEFAULT_DUE_TIME.hour,
      minute ?? DEFAULT_DUE_TIME.minute,
      0,
      0,
    );

    if (due < now) {
      due.setUTCDate(due.getUTCDate() + 1);
    }

    return due;
  }
}
