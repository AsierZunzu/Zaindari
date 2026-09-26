import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { RefreshTokenService } from './refresh-token.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

describe('RefreshTokenService', () => {
  let service: RefreshTokenService;
  let prisma: {
    refreshToken: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    prisma = {
      refreshToken: {
        create: vi.fn().mockResolvedValue({}),
        findUnique: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      // Interactive transactions run against the same mock.
      $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokenService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: vi.fn(() => 30) },
        },
      ],
    }).compile();

    service = module.get(RefreshTokenService);
  });

  describe('issue', () => {
    it('stores only a hash of the token, never the token itself', async () => {
      const raw = await service.issue('user-1', 'Firefox');

      expect(raw).toBeTruthy();
      const data = prisma.refreshToken.create.mock.calls[0][0].data;
      expect(data.tokenHash).toBe(sha256(raw));
      expect(data.tokenHash).not.toBe(raw);
      expect(data.userId).toBe('user-1');
      expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('generates a distinct token and family per call', async () => {
      const first = await service.issue('user-1');
      const second = await service.issue('user-1');

      expect(first).not.toBe(second);
      const [callA, callB] = prisma.refreshToken.create.mock.calls;
      expect(callA[0].data.familyId).not.toBe(callB[0].data.familyId);
    });
  });

  describe('rotate', () => {
    const validRow = {
      id: 'token-1',
      userId: 'user-1',
      familyId: 'family-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };

    it('consumes the old token and issues a replacement in the same family', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(validRow);
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.rotate('raw-token', 'Firefox');

      expect(result.userId).toBe('user-1');
      expect(result.refreshToken).toBeTruthy();
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: 'token-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.refreshToken.create.mock.calls[0][0].data.familyId).toBe(
        'family-1',
      );
    });

    it('extends the expiry on each use (sliding session)', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(validRow);
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await service.rotate('raw-token');

      const { expiresAt } = prisma.refreshToken.create.mock.calls[0][0].data;
      expect(expiresAt.getTime()).toBeGreaterThan(validRow.expiresAt.getTime());
    });

    it('rejects an unknown token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.rotate('bogus')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('rejects an expired token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        ...validRow,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.rotate('raw-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('revokes the whole family when a consumed token is replayed', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        ...validRow,
        revokedAt: new Date(Date.now() - 5 * 60_000),
      });
      prisma.refreshToken.findFirst.mockResolvedValue({ id: 'token-2' });

      await expect(service.rotate('raw-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'family-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('tolerates a token rotated moments ago by a racing request', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        ...validRow,
        revokedAt: new Date(Date.now() - 2_000),
      });
      prisma.refreshToken.findFirst.mockResolvedValue({ id: 'token-2' });

      const result = await service.rotate('raw-token');

      // Two windows refreshing at once, or a response lost to a locked phone:
      // the client gets a token and the family survives.
      expect(result.userId).toBe('user-1');
      expect(prisma.refreshToken.create.mock.calls[0][0].data.familyId).toBe(
        'family-1',
      );
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('does not revive a token signed out moments ago', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        ...validRow,
        revokedAt: new Date(Date.now() - 2_000),
      });
      // Logout leaves the family with no live token, unlike a rotation.
      prisma.refreshToken.findFirst.mockResolvedValue(null);

      await expect(service.rotate('raw-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('lets only one of two concurrent rotations consume the token', async () => {
      // Both requests read the token as live; this one loses the claim.
      prisma.refreshToken.findUnique
        .mockResolvedValueOnce(validRow)
        .mockResolvedValueOnce({ ...validRow, revokedAt: new Date() });
      prisma.refreshToken.updateMany.mockResolvedValueOnce({ count: 0 });
      prisma.refreshToken.findFirst.mockResolvedValue({ id: 'token-2' });

      const result = await service.rotate('raw-token');

      expect(result.userId).toBe('user-1');
      // No successor from the lost claim, one from the grace path.
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('revokeAllForUser', () => {
    it('revokes every live token for the user', async () => {
      await service.revokeAllForUser('user-1');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('purgeExpired', () => {
    it('deletes only rows past their expiry', async () => {
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 3 });

      await expect(service.purgeExpired()).resolves.toBe(3);
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expect.any(Date) } },
      });
    });
  });
});
