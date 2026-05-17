import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { TaskType, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { SchedulesService } from '../schedules/schedules.service.js';

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

  async complete(taskId: string, userId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    if (task.status !== 'pending' && task.status !== 'snoozed') {
      throw new BadRequestException('Task must be pending or snoozed to complete');
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
      throw new NotFoundException('Task not found');
    }
    if (task.status !== 'done') {
      throw new BadRequestException('Only completed tasks can be undone');
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
      throw new NotFoundException('Task not found');
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
      throw new NotFoundException('Task not found');
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

  private calculateNextDueAt(
    from: Date,
    intervalDays: number,
    hour: number,
    minute: number,
  ): Date {
    const next = new Date(from);
    next.setUTCDate(next.getUTCDate() + intervalDays);
    next.setUTCHours(hour, minute, 0, 0);
    return next;
  }
}
