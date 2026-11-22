import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';
import { AdminService } from './admin.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SchedulesService } from '../schedules/schedules.service.js';

const envOidc = {
  name: 'Authentik',
  issuerUrl: 'https://auth.example.com',
  clientId: 'zaindari',
  clientSecret: 'env-secret',
};

const row = {
  id: 'row-1',
  name: 'Keycloak',
  issuerUrl: 'https://kc.example.com',
  clientId: 'kc',
  clientSecret: 'db-secret',
  enabled: true,
};

describe('AdminService OIDC config', () => {
  let service: AdminService;
  let prisma: {
    oidcConfig: {
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
  };
  let oidcEnv: Record<string, string>;

  beforeEach(async () => {
    oidcEnv = {};
    prisma = {
      oidcConfig: {
        findFirst: vi.fn().mockResolvedValue(row),
        update: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: SchedulesService, useValue: {} },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => (key === 'oidc' ? oidcEnv : undefined)),
          },
        },
      ],
    }).compile();

    service = module.get(AdminService);
  });

  it('shows the database row, masked, when env sets nothing', async () => {
    await expect(service.getOidcConfig()).resolves.toMatchObject({
      name: 'Keycloak',
      clientSecret: '********',
      source: 'database',
    });
  });

  it('shows the environment provider, masked, when env sets one', async () => {
    oidcEnv = envOidc;
    const config = await service.getOidcConfig();
    expect(config).toMatchObject({
      name: 'Authentik',
      issuerUrl: 'https://auth.example.com',
      clientSecret: '********',
      source: 'env',
    });
    expect(JSON.stringify(config)).not.toContain('env-secret');
  });

  it('refuses edits and deletion while env manages the provider', async () => {
    oidcEnv = envOidc;
    await expect(
      service.upsertOidcConfig({ name: 'x', issuerUrl: 'y', clientId: 'z' }),
    ).rejects.toThrow(ConflictException);
    await expect(service.deleteOidcConfig()).rejects.toMatchObject({
      response: { code: 'admin.oidcManagedByEnv' },
    });
    expect(prisma.oidcConfig.update).not.toHaveBeenCalled();
    expect(prisma.oidcConfig.delete).not.toHaveBeenCalled();
  });
});
