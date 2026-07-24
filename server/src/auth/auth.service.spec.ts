import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service.js';
import { UsersService } from '../users/users.service.js';
import { RefreshTokenService } from './refresh-token.service.js';

vi.mock('bcrypt', () => ({
  hash: vi.fn(),
  compare: vi.fn(),
}));

describe('AuthService', () => {
  let authService: AuthService;
  let usersService: {
    findByUsername: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  let jwtService: { sign: ReturnType<typeof vi.fn> };
  let configService: { get: ReturnType<typeof vi.fn> };
  let refreshTokenService: {
    issue: ReturnType<typeof vi.fn>;
    rotate: ReturnType<typeof vi.fn>;
    revoke: ReturnType<typeof vi.fn>;
    revokeAllForUser: ReturnType<typeof vi.fn>;
  };

  const mockUser = {
    id: 'user-1',
    username: 'testuser',
    displayName: 'Test User',
    email: 'test@example.com',
    passwordHash: '$2b$10$hashedpassword',
    oidcSubject: null,
    isAdmin: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    usersService = {
      findByUsername: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
    };

    jwtService = {
      sign: vi.fn().mockReturnValue('jwt-token'),
    };

    configService = {
      get: vi.fn((key: string) => {
        const config: Record<string, unknown> = {
          'signup.enabled': true,
          'jwt.secret': 'test-secret',
          'jwt.expiration': '15m',
        };
        return config[key];
      }),
    };

    refreshTokenService = {
      issue: vi.fn().mockResolvedValue('refresh-token'),
      rotate: vi
        .fn()
        .mockResolvedValue({ userId: 'user-1', refreshToken: 'rotated-token' }),
      revoke: vi.fn(),
      revokeAllForUser: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: RefreshTokenService, useValue: refreshTokenService },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('should register a new user and return token', async () => {
      usersService.findByUsername.mockResolvedValue(null);
      usersService.create.mockResolvedValue(mockUser);
      vi.mocked(bcrypt.hash).mockResolvedValue(
        '$2b$10$hashedpassword' as never,
      );

      const result = await authService.register({
        username: 'testuser',
        displayName: 'Test User',
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.accessToken).toBe('jwt-token');
      expect(result.user.username).toBe('testuser');
      expect(
        (result.user as Record<string, unknown>).passwordHash,
      ).toBeUndefined();
    });

    it('should throw ConflictException if username exists', async () => {
      usersService.findByUsername.mockResolvedValue(mockUser);

      await expect(
        authService.register({
          username: 'testuser',
          displayName: 'Test User',
          password: 'password123',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ForbiddenException if signup disabled', async () => {
      configService.get.mockReturnValue(false);

      await expect(
        authService.register({
          username: 'testuser',
          displayName: 'Test User',
          password: 'password123',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('validateUser', () => {
    it('should return user for valid credentials', async () => {
      usersService.findByUsername.mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      const result = await authService.validateUser('testuser', 'password123');
      expect(result.id).toBe('user-1');
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      usersService.findByUsername.mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      await expect(
        authService.validateUser('testuser', 'wrong'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for unknown user', async () => {
      usersService.findByUsername.mockResolvedValue(null);

      await expect(
        authService.validateUser('unknown', 'password'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('login', () => {
    it('should return token for valid login', async () => {
      usersService.findByUsername.mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      const result = await authService.login('testuser', 'password123');
      expect(result.accessToken).toBe('jwt-token');
      expect(result.user.username).toBe('testuser');
    });
  });

  describe('refresh', () => {
    it('should return a new access token and a rotated refresh token', async () => {
      usersService.findById.mockResolvedValue(mockUser);

      const result = await authService.refresh('raw-refresh-token');

      expect(refreshTokenService.rotate).toHaveBeenCalledWith(
        'raw-refresh-token',
        undefined,
      );
      expect(result.accessToken).toBe('jwt-token');
      expect(result.refreshToken).toBe('rotated-token');
    });

    it('should throw and revoke the session if the user no longer exists', async () => {
      usersService.findById.mockResolvedValue(null);

      await expect(authService.refresh('raw-refresh-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(refreshTokenService.revokeAllForUser).toHaveBeenCalledWith(
        'user-1',
      );
    });

    it('should propagate rejection of an invalid refresh token', async () => {
      refreshTokenService.rotate.mockRejectedValue(
        new UnauthorizedException('Invalid refresh token'),
      );

      await expect(authService.refresh('bogus')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(usersService.findById).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should revoke the presented refresh token', async () => {
      await authService.logout('raw-refresh-token');
      expect(refreshTokenService.revoke).toHaveBeenCalledWith(
        'raw-refresh-token',
      );
    });

    it('should be a no-op when no token is presented', async () => {
      await authService.logout(undefined);
      expect(refreshTokenService.revoke).not.toHaveBeenCalled();
    });
  });
});
