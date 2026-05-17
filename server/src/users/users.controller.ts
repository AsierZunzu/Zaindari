import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { JwtAuthGuard } from '../common/guards/auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { User } from '@prisma/client';

@Controller('api/me')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async getProfile(@CurrentUser() user: User) {
    const { passwordHash, ...profile } = user;
    return profile;
  }

  @Patch()
  async updateProfile(
    @CurrentUser() user: User,
    @Body() body: { displayName?: string; email?: string },
  ) {
    const updated = await this.usersService.update(user.id, body);
    const { passwordHash, ...profile } = updated;
    return profile;
  }
}
