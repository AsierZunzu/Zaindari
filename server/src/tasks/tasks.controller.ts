import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { TaskType, TaskStatus } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/auth.guard.js';
import { PlantAccessGuard } from '../common/guards/plant-access.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TasksService } from './tasks.service.js';

@Controller('api')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('tasks')
  async getTasks(
    @CurrentUser() user: { id: string },
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
    @Query('includeOverdue') includeOverdue?: string,
  ) {
    return this.tasksService.getTasksForUser(user.id, {
      from: this.parseDate(from, 'from'),
      to: this.parseDate(to, 'to'),
      statuses: this.parseStatuses(status),
      includeOverdue: includeOverdue === 'true',
    });
  }

  @Get('plants/:id/tasks')
  @UseGuards(PlantAccessGuard)
  async getTasksForPlant(
    @Param('id') plantId: string,
    @Query('status') status?: TaskStatus,
    @Query('limit') limit?: string,
  ) {
    return this.tasksService.getTasksForPlant(plantId, {
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post('plants/:id/tasks/:taskType/complete')
  @UseGuards(PlantAccessGuard)
  async completeByType(
    @Param('id') plantId: string,
    @Param('taskType') taskType: TaskType,
    @CurrentUser() user: { id: string },
  ) {
    return this.tasksService.completeByType(plantId, taskType, user.id);
  }

  @Post('tasks/:taskId/complete')
  async complete(
    @Param('taskId') taskId: string,
    @CurrentUser() user: { id: string },
  ) {
    await this.ensureTaskPlantAccess(taskId, user.id);
    return this.tasksService.complete(taskId, user.id);
  }

  @Post('tasks/:taskId/undo')
  async undo(
    @Param('taskId') taskId: string,
    @CurrentUser() user: { id: string },
  ) {
    await this.ensureTaskPlantAccess(taskId, user.id);
    return this.tasksService.undo(taskId);
  }

  @Post('tasks/:taskId/snooze')
  async snooze(
    @Param('taskId') taskId: string,
    @Body() body: { hours: number },
    @CurrentUser() user: { id: string },
  ) {
    await this.ensureTaskPlantAccess(taskId, user.id);
    return this.tasksService.snooze(taskId, body);
  }

  @Post('tasks/:taskId/skip')
  async skip(
    @Param('taskId') taskId: string,
    @Body() body: { reason?: string },
    @CurrentUser() user: { id: string },
  ) {
    await this.ensureTaskPlantAccess(taskId, user.id);
    return this.tasksService.skip(taskId, body, user.id);
  }

  private parseDate(value: string | undefined, param: string): Date | undefined {
    if (!value) {
      return undefined;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid date for "${param}"`);
    }
    return parsed;
  }

  private parseStatuses(value?: string): TaskStatus[] | undefined {
    if (!value) {
      return undefined;
    }
    const allowed = Object.values(TaskStatus) as string[];
    const statuses = value.split(',').map((s) => s.trim()).filter(Boolean);
    const invalid = statuses.filter((s) => !allowed.includes(s));
    if (invalid.length) {
      throw new BadRequestException(`Invalid status: ${invalid.join(', ')}`);
    }
    return statuses as TaskStatus[];
  }

  private async ensureTaskPlantAccess(taskId: string, userId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        plant: {
          include: { shares: true },
        },
      },
    });

    if (!task) {
      throw new ForbiddenException('Task not found');
    }

    const isOwner = task.plant.ownerId === userId;
    const isShared = task.plant.shares.some((s) => s.userId === userId);

    if (!isOwner && !isShared) {
      throw new ForbiddenException('No access to this plant');
    }
  }
}
