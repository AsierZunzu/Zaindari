import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { TaskType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { apiError, ERROR_CODES } from '../common/errors/api-error.js';

export interface NotificationTime {
  hour: number;
  minute: number;
}

export interface MergedSchedule {
  taskType: TaskType;
  intervalDays: number;
  /**
   * The time this plant pins for everyone, or null when each collaborator is
   * reminded at their own. Not the same thing as when a task is due.
   */
  hour: number | null;
  minute: number | null;
  isOverride: boolean;
  enabled: boolean;
}

const DEFAULTS: Record<TaskType, { intervalDays: number }> = {
  watering: { intervalDays: 3 },
  fertilization: { intervalDays: 30 },
  misting: { intervalDays: 2 },
  repotting: { intervalDays: 365 },
};

/**
 * The hour a task's `dueAt` is stamped at when the plant pins no time of its
 * own. A due date is one shared fact about a task, so it cannot follow any
 * individual collaborator's reminder preference — that governs the push only.
 */
export const DEFAULT_DUE_TIME: NotificationTime = { hour: 9, minute: 0 };

@Injectable()
export class SchedulesService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedDefaults();
  }

  // ── Per-user notification times ────────────────────────────────────

  async getUserNotificationTimes(userId: string) {
    const [user, overrides] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { notificationHour: true, notificationMinute: true },
      }),
      this.prisma.userNotificationTime.findMany({ where: { userId } }),
    ]);

    const base: NotificationTime = user
      ? { hour: user.notificationHour, minute: user.notificationMinute }
      : { ...DEFAULT_DUE_TIME };

    return {
      base,
      overrides: Object.values(TaskType).reduce<
        Partial<Record<TaskType, NotificationTime>>
      >((acc, taskType) => {
        const row = overrides.find((o) => o.taskType === taskType);
        if (row) acc[taskType] = { hour: row.hour, minute: row.minute };
        return acc;
      }, {}),
    };
  }

  async setUserBaseTime(userId: string, time: NotificationTime) {
    assertValidTime(time);
    await this.prisma.user.update({
      where: { id: userId },
      data: { notificationHour: time.hour, notificationMinute: time.minute },
    });
    return this.getUserNotificationTimes(userId);
  }

  /**
   * A null time removes the override, so this task type falls back to the
   * user's base time.
   */
  async setUserTaskTime(
    userId: string,
    taskType: TaskType,
    time: NotificationTime | null,
  ) {
    if (time === null) {
      await this.prisma.userNotificationTime.deleteMany({
        where: { userId, taskType },
      });
      return this.getUserNotificationTimes(userId);
    }

    assertValidTime(time);
    await this.prisma.userNotificationTime.upsert({
      where: { userId_taskType: { userId, taskType } },
      update: { hour: time.hour, minute: time.minute },
      create: { userId, taskType, hour: time.hour, minute: time.minute },
    });
    return this.getUserNotificationTimes(userId);
  }

  // ── Schedules ──────────────────────────────────────────────────────

  async getDefaultSchedules() {
    return this.prisma.defaultSchedule.findMany();
  }

  async setDefaultSchedule(taskType: TaskType, data: { intervalDays: number }) {
    return this.prisma.defaultSchedule.upsert({
      where: { taskType },
      update: { intervalDays: data.intervalDays },
      create: { taskType, intervalDays: data.intervalDays },
    });
  }

  async getPlantSchedules(plantId: string) {
    return this.prisma.plantSchedule.findMany({
      where: { plantId },
    });
  }

  /**
   * The one place schedule resolution happens: hardcoded DEFAULTS →
   * DefaultSchedule → PlantSchedule. Only the interval and the enabled flag
   * merge here. The returned `hour` stays null unless the plant pins one,
   * because the reminder time otherwise depends on who is being reminded —
   * `resolveNotificationTime` answers that.
   */
  async getMergedSchedules(plantId: string): Promise<MergedSchedule[]> {
    const [defaults, overrides] = await Promise.all([
      this.prisma.defaultSchedule.findMany(),
      this.prisma.plantSchedule.findMany({ where: { plantId } }),
    ]);

    const defaultMap = new Map(defaults.map((d) => [d.taskType, d]));
    const overrideMap = new Map(overrides.map((o) => [o.taskType, o]));

    return Object.values(TaskType).map((taskType) => {
      const override = overrideMap.get(taskType);
      const def = defaultMap.get(taskType);
      const fallback = DEFAULTS[taskType];

      if (override) {
        return {
          taskType,
          intervalDays: override.intervalDays,
          hour: override.hour,
          minute: override.minute,
          isOverride: true,
          enabled: override.enabled,
        };
      }

      return {
        taskType,
        intervalDays: def?.intervalDays ?? fallback.intervalDays,
        hour: null,
        minute: null,
        isOverride: false,
        enabled: true,
      };
    });
  }

  async setPlantSchedule(
    plantId: string,
    taskType: TaskType,
    data: { intervalDays: number; hour: number | null; minute: number | null },
  ) {
    const time = normalizeOverride(data.hour, data.minute);

    return this.prisma.plantSchedule.upsert({
      where: { plantId_taskType: { plantId, taskType } },
      update: {
        intervalDays: data.intervalDays,
        hour: time.hour,
        minute: time.minute,
      },
      create: {
        plantId,
        taskType,
        intervalDays: data.intervalDays,
        hour: time.hour,
        minute: time.minute,
      },
    });
  }

  async removePlantSchedule(plantId: string, taskType: TaskType) {
    return this.prisma.plantSchedule.delete({
      where: { plantId_taskType: { plantId, taskType } },
    });
  }

  async seedDefaults() {
    for (const [taskType, config] of Object.entries(DEFAULTS)) {
      await this.prisma.defaultSchedule.upsert({
        where: { taskType: taskType as TaskType },
        update: {},
        create: {
          taskType: taskType as TaskType,
          intervalDays: config.intervalDays,
        },
      });
    }
  }
}

/**
 * When one particular person should be reminded about one particular task.
 *
 * A time pinned on the plant wins outright — the owner has decided this plant
 * is watered at 07:00 and it would be pointless to ping a collaborator at 21:00
 * about it. Otherwise the user's own preference decides, refined per task type.
 */
export function resolveNotificationTime(
  plantOverride: { hour: number | null; minute: number | null },
  user: {
    base: NotificationTime;
    overrides: Partial<Record<TaskType, NotificationTime>>;
  },
  taskType: TaskType,
): NotificationTime {
  if (plantOverride.hour !== null) {
    return { hour: plantOverride.hour, minute: plantOverride.minute ?? 0 };
  }
  return user.overrides[taskType] ?? user.base;
}

/**
 * Hour and minute are one setting, so they are stored or cleared together —
 * a row with an hour but no minute would resolve ambiguously.
 */
function normalizeOverride(
  hour: number | null | undefined,
  minute: number | null | undefined,
): { hour: number | null; minute: number | null } {
  if (hour === null || hour === undefined) {
    return { hour: null, minute: null };
  }
  const time = { hour, minute: minute ?? 0 };
  assertValidTime(time);
  return time;
}

export function assertValidTime(time: NotificationTime) {
  const valid =
    Number.isInteger(time.hour) &&
    time.hour >= 0 &&
    time.hour <= 23 &&
    Number.isInteger(time.minute) &&
    time.minute >= 0 &&
    time.minute <= 59;

  if (!valid) {
    throw new BadRequestException(
      apiError(ERROR_CODES.invalidNotificationTime, 'Invalid notification time'),
    );
  }
}
