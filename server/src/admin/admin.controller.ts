import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AdminService } from './admin.service.js';
import { JwtAuthGuard } from '../common/guards/auth.guard.js';
import { AdminGuard } from '../common/guards/admin.guard.js';

@Controller('api/admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ── Users ──────────────────────────────────────────────────────────

  @Get('users')
  listUsers() {
    return this.adminService.listUsers();
  }

  @Post('users')
  createUser(
    @Body()
    body: {
      username: string;
      password: string;
      displayName: string;
      email?: string;
      isAdmin?: boolean;
    },
  ) {
    return this.adminService.createUser(body);
  }

  @Patch('users/:id')
  updateUser(
    @Param('id') id: string,
    @Body()
    body: {
      displayName?: string;
      email?: string;
      isAdmin?: boolean;
      password?: string;
    },
  ) {
    return this.adminService.updateUser(id, body);
  }

  @Delete('users/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteUser(@Param('id') id: string) {
    return this.adminService.deleteUser(id);
  }

  // ── App Config ─────────────────────────────────────────────────────

  @Get('config')
  getConfig() {
    return this.adminService.getConfig();
  }

  @Put('config')
  updateConfig(@Body() body: Record<string, string>) {
    return this.adminService.updateConfig(body);
  }

  // ── Default Schedules ──────────────────────────────────────────────

  @Get('schedules')
  getSchedules() {
    return this.adminService.getSchedules();
  }

  @Put('schedules/:taskType')
  updateSchedule(
    @Param('taskType') taskType: string,
    @Body() body: { intervalDays?: number },
  ) {
    return this.adminService.updateSchedule(taskType, body);
  }

  // ── OIDC Config ────────────────────────────────────────────────────

  @Get('oidc')
  getOidcConfig() {
    return this.adminService.getOidcConfig();
  }

  @Put('oidc')
  upsertOidcConfig(
    @Body()
    body: {
      name: string;
      issuerUrl: string;
      clientId: string;
      clientSecret?: string;
      enabled?: boolean;
    },
  ) {
    return this.adminService.upsertOidcConfig(body);
  }

  @Delete('oidc')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteOidcConfig() {
    return this.adminService.deleteOidcConfig();
  }
}
