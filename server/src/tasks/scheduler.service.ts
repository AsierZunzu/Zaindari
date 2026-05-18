import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TaskType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { SchedulesService } from '../schedules/schedules.service.js';
import { PushService } from '../push/push.service.js';

const TASK_TYPE_LABELS: Record<string, { emoji: string; verb: string }> = {
  watering: { emoji: '\uD83D\uDCA7', verb: 'water' },
  fertilization: { emoji: '\uD83C\uDF31', verb: 'fertilize' },
  misting: { emoji: '\uD83C\uDF2B\uFE0F', verb: 'mist' },
  repotting: { emoji: '\uD83E\uDEb4', verb: 'repot' },
};

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulesService: SchedulesService,
    private readonly pushService: PushService,
  ) {}

  @Cron('* * * * *')
  async evaluateTasks() {
    const plants = await this.prisma.plant.findMany({ select: { id: true } });
    const taskTypes = Object.values(TaskType);

    for (const plant of plants) {
      const mergedSchedules = await this.schedulesService.getMergedSchedules(plant.id);

      for (const taskType of taskTypes) {
        const schedule = mergedSchedules.find((s) => s.taskType === taskType);
        if (!schedule || !schedule.enabled) {
          continue;
        }

        // Handle snoozed tasks that should be un-snoozed
        const now = new Date();
        await this.prisma.task.updateMany({
          where: {
            plantId: plant.id,
            taskType,
            status: 'snoozed',
            snoozeUntil: { lte: now },
          },
          data: {
            status: 'pending',
            snoozeUntil: null,
          },
        });

        // Check if there is already a pending or snoozed task
        const existingPending = await this.prisma.task.findFirst({
          where: {
            plantId: plant.id,
            taskType,
            status: { in: ['pending', 'snoozed'] },
          },
        });

        if (existingPending) {
          continue;
        }

        // Find the most recent task (any status)
        const latestTask = await this.prisma.task.findFirst({
          where: {
            plantId: plant.id,
            taskType,
          },
          orderBy: { createdAt: 'desc' },
        });

        if (!latestTask) {
          // No tasks exist at all — create the first one
          const dueAt = new Date();
          dueAt.setUTCHours(schedule.hour, schedule.minute, 0, 0);
          if (dueAt <= now) {
            // If the scheduled time has already passed today, it's still fine — it's due now
          }
          await this.prisma.task.create({
            data: {
              plantId: plant.id,
              taskType,
              status: 'pending',
              dueAt,
            },
          });
          await this.sendTaskNotification(plant.id, taskType);
          continue;
        }

        // Latest task is done or skipped — check if enough time has passed
        if (latestTask.status === 'done' || latestTask.status === 'skipped') {
          const referenceDate = latestTask.completedAt ?? latestTask.updatedAt;
          const elapsed = now.getTime() - referenceDate.getTime();
          const intervalMs = schedule.intervalDays * 24 * 60 * 60 * 1000;

          if (elapsed >= intervalMs) {
            const dueAt = new Date(referenceDate);
            dueAt.setUTCDate(dueAt.getUTCDate() + schedule.intervalDays);
            dueAt.setUTCHours(schedule.hour, schedule.minute, 0, 0);

            await this.prisma.task.create({
              data: {
                plantId: plant.id,
                taskType,
                status: 'pending',
                dueAt,
              },
            });
            await this.sendTaskNotification(plant.id, taskType);
          }
        }
      }
    }
  }

  private async sendTaskNotification(plantId: string, taskType: TaskType) {
    try {
      const plant = await this.prisma.plant.findUnique({
        where: { id: plantId },
        select: { name: true },
      });
      if (!plant) return;

      const label = TASK_TYPE_LABELS[taskType] || { emoji: '', verb: taskType };
      await this.pushService.notifyPlantCollaborators(plantId, {
        title: 'Zaindari',
        body: `${label.emoji} Time to ${label.verb} ${plant.name}!`,
        url: `/plants/${plantId}`,
      });
    } catch (err) {
      this.logger.warn(`Failed to send push notification: ${err}`);
    }
  }
}
