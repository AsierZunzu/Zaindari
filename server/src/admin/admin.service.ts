import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import type { TaskType } from '@prisma/client';
import { apiError, ERROR_CODES } from '../common/errors/api-error.js';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Users ──────────────────────────────────────────────────────────

  async listUsers() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return users.map(({ passwordHash, ...u }) => u);
  }

  async createUser(data: {
    username: string;
    password: string;
    displayName: string;
    email?: string;
    isAdmin?: boolean;
  }) {
    const existing = await this.prisma.user.findUnique({
      where: { username: data.username },
    });
    if (existing) {
      throw new ConflictException(
        apiError(ERROR_CODES.usernameTaken, 'Username already taken'),
      );
    }

    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = await this.prisma.user.create({
      data: {
        username: data.username,
        displayName: data.displayName,
        email: data.email,
        passwordHash,
        isAdmin: data.isAdmin ?? false,
      },
    });

    const { passwordHash: _, ...result } = user;
    return result;
  }

  async updateUser(
    id: string,
    data: {
      displayName?: string;
      email?: string;
      isAdmin?: boolean;
      password?: string;
    },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updateData: Record<string, unknown> = {};
    if (data.displayName !== undefined) updateData.displayName = data.displayName;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.isAdmin !== undefined) updateData.isAdmin = data.isAdmin;
    if (data.password) {
      updateData.passwordHash = await bcrypt.hash(data.password, 10);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: updateData,
    });

    const { passwordHash: _, ...result } = updated;
    return result;
  }

  async deleteUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    await this.prisma.user.delete({ where: { id } });
  }

  // ── App Config ─────────────────────────────────────────────────────

  async getConfig() {
    return this.prisma.appConfig.findMany();
  }

  async updateConfig(entries: Record<string, string>) {
    const ops = Object.entries(entries).map(([key, value]) =>
      this.prisma.appConfig.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      }),
    );
    await this.prisma.$transaction(ops);
    return this.getConfig();
  }

  // ── Default Schedules ──────────────────────────────────────────────

  async getSchedules() {
    return this.prisma.defaultSchedule.findMany({
      orderBy: { taskType: 'asc' },
    });
  }

  async updateSchedule(
    taskType: string,
    data: { intervalDays?: number; hour?: number; minute?: number },
  ) {
    const schedule = await this.prisma.defaultSchedule.findUnique({
      where: { taskType: taskType as TaskType },
    });
    if (!schedule) {
      throw new NotFoundException(
        `Default schedule for ${taskType} not found`,
      );
    }

    return this.prisma.defaultSchedule.update({
      where: { taskType: taskType as TaskType },
      data,
    });
  }

  // ── OIDC Config ────────────────────────────────────────────────────

  async getOidcConfig() {
    const config = await this.prisma.oidcConfig.findFirst();
    if (!config) return null;

    return {
      ...config,
      clientSecret: '********',
    };
  }

  async upsertOidcConfig(data: {
    name: string;
    issuerUrl: string;
    clientId: string;
    clientSecret?: string;
    enabled?: boolean;
  }) {
    const existing = await this.prisma.oidcConfig.findFirst();

    if (existing) {
      const updateData: Record<string, unknown> = {
        name: data.name,
        issuerUrl: data.issuerUrl,
        clientId: data.clientId,
      };
      if (data.clientSecret && data.clientSecret !== '********') {
        updateData.clientSecret = data.clientSecret;
      }
      if (data.enabled !== undefined) {
        updateData.enabled = data.enabled;
      }

      const updated = await this.prisma.oidcConfig.update({
        where: { id: existing.id },
        data: updateData,
      });
      return { ...updated, clientSecret: '********' };
    }

    if (!data.clientSecret || data.clientSecret === '********') {
      throw new ConflictException(
        'Client secret is required when creating OIDC config',
      );
    }

    const created = await this.prisma.oidcConfig.create({
      data: {
        name: data.name,
        issuerUrl: data.issuerUrl,
        clientId: data.clientId,
        clientSecret: data.clientSecret,
        enabled: data.enabled ?? true,
      },
    });
    return { ...created, clientSecret: '********' };
  }

  async deleteOidcConfig() {
    const existing = await this.prisma.oidcConfig.findFirst();
    if (!existing) {
      throw new NotFoundException('OIDC config not found');
    }
    await this.prisma.oidcConfig.delete({ where: { id: existing.id } });
  }
}
