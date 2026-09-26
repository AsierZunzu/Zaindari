import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { OidcService } from './oidc.service.js';
import { RefreshTokenService } from './refresh-token.service.js';
import { REFRESH_COOKIE_NAME } from './session-cookie.js';

describe('AuthController.refresh', () => {
  let controller: AuthController;
  let authService: { refresh: ReturnType<typeof vi.fn> };
  let res: {
    cookie: ReturnType<typeof vi.fn>;
    clearCookie: ReturnType<typeof vi.fn>;
  };

  const req = {
    cookies: { [REFRESH_COOKIE_NAME]: 'raw-token' },
    headers: { 'user-agent': 'test' },
    protocol: 'http',
  } as unknown as Request;

  beforeEach(async () => {
    authService = { refresh: vi.fn() };
    res = { cookie: vi.fn(), clearCookie: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: OidcService, useValue: {} },
        { provide: RefreshTokenService, useValue: { ttlMs: 1000 } },
        { provide: ConfigService, useValue: { get: vi.fn() } },
      ],
    }).compile();

    controller = module.get(AuthController);
  });

  it('sets the rotated cookie on success', async () => {
    authService.refresh.mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'rotated',
    });

    await expect(
      controller.refresh(req, res as unknown as Response),
    ).resolves.toEqual({ accessToken: 'access' });
    expect(res.cookie).toHaveBeenCalledWith(
      REFRESH_COOKIE_NAME,
      'rotated',
      expect.any(Object),
    );
  });

  it('clears the cookie when the token is rejected', async () => {
    authService.refresh.mockRejectedValue(
      new UnauthorizedException('Refresh token expired'),
    );

    await expect(
      controller.refresh(req, res as unknown as Response),
    ).rejects.toThrow(UnauthorizedException);
    expect(res.clearCookie).toHaveBeenCalled();
  });

  it('keeps the cookie when the refresh fails for another reason', async () => {
    authService.refresh.mockRejectedValue(new Error('Connection terminated'));

    await expect(
      controller.refresh(req, res as unknown as Response),
    ).rejects.toThrow('Connection terminated');
    // A database blip must not log the user out.
    expect(res.clearCookie).not.toHaveBeenCalled();
  });
});
