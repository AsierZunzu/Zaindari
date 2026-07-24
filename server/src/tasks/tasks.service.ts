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

    return this.prisma.task.findMany({
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
        plant: { select: { id: true, name: true, location: true } },
      },
      orderBy: { dueAt: 'asc' },
    });
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

    const mergedSchedules = await this.schedulesService.getMergedSchedules(task.plantId);
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

    if (schedule) {
      const nextDueAt = this.calculateNextDueAt(now, schedule.intervalDays, schedule.hour, schedule.minute);
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
      const mergedSchedules = await this.schedulesService.getMergedSchedules(plantId);
      const schedule = mergedSchedules.find((s) => s.taskType === taskType);
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
        apiError(ERROR_CODES.taskNotUndoable, 'Only completed tasks can be undone'),
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

  async snooze(taskId: string, data: { hours: number }) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException(
        apiError(ERROR_CODES.taskNotFound, 'Task not found'),
      );
    }

    const snoozeUntil = new Date(Date.now() + data.hours * 60 * 60 * 1000);

    return this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'snoozed',
        snoozeUntil,
      },
    });
  }

  async skip(taskId: string, data: { reason?: string }, userId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException(
        apiError(ERROR_CODES.taskNotFound, 'Task not found'),
      );
    }

    const mergedSchedules = await this.schedulesService.getMergedSchedules(task.plantId);
    const schedule = mergedSchedules.find((s) => s.taskType === task.taskType);

    const now = new Date();
    const skippedTask = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'skipped',
        skipReason: data.reason ?? null,
      },
    });

    if (schedule) {
      const nextDueAt = this.calculateNextDueAt(now, schedule.intervalDays, schedule.hour, schedule.minute);
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
}
