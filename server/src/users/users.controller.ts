import {
  Controller,
  Get,
  Patch,
  Put,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service.js';
import { JwtAuthGuard } from '../common/guards/auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { SchedulesService } from '../schedules/schedules.service.js';
import type { TaskType, User } from '@prisma/client';

@Controller('api/me')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly schedulesService: SchedulesService,
  ) {}

  @Get()
  async getProfile(@CurrentUser() user: User) {
    const { passwordHash, ...profile } = user;
    return profile;
  }

  @Patch()
  async updateProfile(
    @CurrentUser() user: User,
    @Body() body: { displayName?: string; email?: string; locale?: string },
  ) {
    const updated = await this.usersService.update(user.id, body);
    const { passwordHash, ...profile } = updated;
    return profile;
  }

  // ── Notification times ─────────────────────────────────────────────

  @Get('notification-times')
  getNotificationTimes(@CurrentUser() user: User) {
    return this.schedulesService.getUserNotificationTimes(user.id);
  }

  @Put('notification-times')
  setBaseNotificationTime(
    @CurrentUser() user: User,
    @Body() body: { hour: number; minute: number },
  ) {
    return this.schedulesService.setUserBaseTime(user.id, body);
  }

  /**
   * A null hour removes the override, so this task type falls back to the
   * user's base time.
   */
  @Put('notification-times/:taskType')
  setTaskNotificationTime(
    @CurrentUser() user: User,
    @Param('taskType') taskType: TaskType,
    @Body() body: { hour: number | null; minute: number | null },
  ) {
    return this.schedulesService.setUserTaskTime(
      user.id,
      taskType,
      body.hour === null
        ? null
        : { hour: body.hour, minute: body.minute ?? 0 },
    );
  }
}
