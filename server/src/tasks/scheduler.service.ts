import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TaskType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  SchedulesService,
  resolveNotificationTime,
  DEFAULT_DUE_TIME,
  type MergedSchedule,
  type NotificationTime,
} from '../schedules/schedules.service.js';
import { PushService } from '../push/push.service.js';
import { translate } from '../i18n/messages.js';
import { shouldNotifyNow } from './notification-window.js';

/**
 * The emoji stays in code because it is the same in every language; only the
 * sentence is translated, and as a whole sentence \u2014 see `i18n/messages.ts`.
 */
const TASK_TYPE_EMOJI: Record<string, string> = {
  watering: '\uD83D\uDCA7',
  fertilization: '\uD83C\uDF31',
  misting: '\uD83C\uDF2B\uFE0F',
  repotting: '\uD83E\uDEb4',
};

interface UserTimes {
  base: NotificationTime;
  overrides: Partial<Record<TaskType, NotificationTime>>;
}

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulesService: SchedulesService,
    private readonly pushService: PushService,
  ) {}

  /**
   * Two phases per tick. Creating a task and notifying about it are deliberately
   * separate: a task appears as pending the moment its interval elapses, but
   * each person is pushed at the time they asked to be reminded
   * (`notification-window.ts`).
   */
  @Cron('* * * * *')
  async evaluateTasks() {
    // One resolution per plant per tick, shared by both phases.
    const scheduleCache = new Map<string, MergedSchedule[]>();
    const schedulesFor = async (plantId: string) => {
      let schedules = scheduleCache.get(plantId);
      if (!schedules) {
        schedules = await this.schedulesService.getMergedSchedules(plantId);
        scheduleCache.set(plantId, schedules);
      }
      return schedules;
    };

    await this.createDueTasks(schedulesFor);
    await this.dispatchNotifications(schedulesFor);
  }

  private async createDueTasks(
    schedulesFor: (plantId: string) => Promise<MergedSchedule[]>,
  ) {
    const plants = await this.prisma.plant.findMany({ select: { id: true } });
    const taskTypes = Object.values(TaskType);

    for (const plant of plants) {
      const mergedSchedules = await schedulesFor(plant.id);

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
          dueAt.setUTCHours(
            schedule.hour ?? DEFAULT_DUE_TIME.hour,
            schedule.minute ?? DEFAULT_DUE_TIME.minute,
            0,
            0,
          );
          await this.prisma.task.create({
            data: {
              plantId: plant.id,
              taskType,
              status: 'pending',
              dueAt,
            },
          });
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
            dueAt.setUTCHours(
              schedule.hour ?? DEFAULT_DUE_TIME.hour,
              schedule.minute ?? DEFAULT_DUE_TIME.minute,
              0,
              0,
            );

            await this.prisma.task.create({
              data: {
                plantId: plant.id,
                taskType,
                status: 'pending',
                dueAt,
              },
            });
          }
        }
      }
    }
  }

  /**
   * Sends the reminders that have come due, per person rather than per task:
   * two collaborators on the same plant can want to hear about it hours apart,
   * so each pair of (task, recipient) is gated and latched on its own.
   */
  private async dispatchNotifications(
    schedulesFor: (plantId: string) => Promise<MergedSchedule[]>,
  ) {
    const pending = await this.prisma.task.findMany({
      where: { status: 'pending' },
      select: {
        id: true,
        plantId: true,
        taskType: true,
        createdAt: true,
        dueAt: true,
        notifications: { select: { userId: true } },
        plant: {
          select: {
            name: true,
            owner: { select: { id: true, locale: true } },
            shares: {
              select: { user: { select: { id: true, locale: true } } },
            },
          },
        },
      },
    });

    const now = new Date();
    // Preferences are per user, not per task, so they are read once per tick.
    const timesCache = new Map<string, UserTimes>();
    const timesFor = async (userId: string) => {
      let times = timesCache.get(userId);
      if (!times) {
        times = await this.schedulesService.getUserNotificationTimes(userId);
        timesCache.set(userId, times);
      }
      return times;
    };

    for (const task of pending) {
      const schedules = await schedulesFor(task.plantId);
      const schedule = schedules.find((s) => s.taskType === task.taskType);
      if (!schedule || !schedule.enabled) {
        continue;
      }

      const alreadyNotified = new Set(task.notifications.map((n) => n.userId));

      // Map, not Set: the owner may also appear as a share, and we need one
      // locale per distinct user.
      const recipients = new Map<string, string>([
        [task.plant.owner.id, task.plant.owner.locale],
      ]);
      for (const share of task.plant.shares) {
        recipients.set(share.user.id, share.user.locale);
      }

      for (const [userId, locale] of recipients) {
        if (alreadyNotified.has(userId)) {
          continue;
        }

        const time = resolveNotificationTime(
          schedule,
          await timesFor(userId),
          task.taskType,
        );

        if (!shouldNotifyNow(task, now, time)) {
          continue;
        }

        await this.sendTaskNotification(
          userId,
          locale,
          task.plantId,
          task.plant.name,
          task.taskType,
        );

        // Written whether or not the push got through: at-most-once. A push
        // endpoint that is down must not make this pair retry every minute
        // forever, and the task stays visible in the app regardless.
        await this.prisma.taskNotification.create({
          data: { taskId: task.id, userId, notifiedAt: new Date() },
        });
      }
    }
  }

  private async sendTaskNotification(
    userId: string,
    locale: string,
    plantId: string,
    plantName: string,
    taskType: TaskType,
  ) {
    try {
      const emoji = TASK_TYPE_EMOJI[taskType] ?? '';
      await this.pushService.sendNotification(userId, {
        title: translate(locale, 'push.title'),
        body: `${emoji} ${translate(locale, `push.taskDue.${taskType}`, {
          plant: plantName,
        })}`.trim(),
        url: `/plants/${plantId}`,
      });
    } catch (err) {
      this.logger.warn(`Failed to send push notification: ${err}`);
    }
  }
}
