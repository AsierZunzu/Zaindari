import { Injectable, OnModuleInit } from '@nestjs/common';
import { TaskType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export interface MergedSchedule {
  taskType: TaskType;
  intervalDays: number;
  hour: number;
  minute: number;
  isOverride: boolean;
  enabled: boolean;
}

const DEFAULTS: Record<TaskType, { intervalDays: number; hour: number; minute: number }> = {
  watering: { intervalDays: 3, hour: 8, minute: 0 },
  fertilization: { intervalDays: 30, hour: 9, minute: 0 },
  misting: { intervalDays: 2, hour: 8, minute: 0 },
  repotting: { intervalDays: 365, hour: 10, minute: 0 },
};

@Injectable()
export class SchedulesService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedDefaults();
  }

  async getDefaultSchedules() {
    return this.prisma.defaultSchedule.findMany();
  }

  async setDefaultSchedule(
    taskType: TaskType,
    data: { intervalDays: number; hour: number; minute: number },
  ) {
    return this.prisma.defaultSchedule.upsert({
      where: { taskType },
      update: {
        intervalDays: data.intervalDays,
        hour: data.hour,
        minute: data.minute,
      },
      create: {
        taskType,
        intervalDays: data.intervalDays,
        hour: data.hour,
        minute: data.minute,
      },
    });
  }

  async getPlantSchedules(plantId: string) {
    return this.prisma.plantSchedule.findMany({
      where: { plantId },
    });
  }

  async getMergedSchedules(plantId: string): Promise<MergedSchedule[]> {
    const [defaults, overrides] = await Promise.all([
      this.prisma.defaultSchedule.findMany(),
      this.prisma.plantSchedule.findMany({ where: { plantId } }),
    ]);

    const defaultMap = new Map(defaults.map((d) => [d.taskType, d]));
    const overrideMap = new Map(overrides.map((o) => [o.taskType, o]));

    const taskTypes = Object.values(TaskType);

    return taskTypes.map((taskType) => {
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
        hour: def?.hour ?? fallback.hour,
        minute: def?.minute ?? fallback.minute,
        isOverride: false,
        enabled: true,
      };
    });
  }

  async setPlantSchedule(
    plantId: string,
    taskType: TaskType,
    data: { intervalDays: number; hour: number; minute: number },
  ) {
    return this.prisma.plantSchedule.upsert({
      where: { plantId_taskType: { plantId, taskType } },
      update: {
        intervalDays: data.intervalDays,
        hour: data.hour,
        minute: data.minute,
      },
      create: {
        plantId,
        taskType,
        intervalDays: data.intervalDays,
        hour: data.hour,
        minute: data.minute,
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
          hour: config.hour,
          minute: config.minute,
        },
      });
    }
  }
}
