import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { OidcLoginError, OidcService } from './oidc.service.js';
import { RefreshTokenService } from './refresh-token.service.js';
import {
  OIDC_FLOW_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
} from './session-cookie.js';

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

describe('AuthController OIDC', () => {
  let controller: AuthController;
  let oidcService: {
    beginLogin: ReturnType<typeof vi.fn>;
    completeLogin: ReturnType<typeof vi.fn>;
  };
  let refreshTokenService: {
    ttlMs: number;
    issue: ReturnType<typeof vi.fn>;
  };
  let res: {
    cookie: ReturnType<typeof vi.fn>;
    clearCookie: ReturnType<typeof vi.fn>;
    redirect: ReturnType<typeof vi.fn>;
  };

  const flow = { state: 's', nonce: 'n', codeVerifier: 'v' };

  function request(cookies: Record<string, string> = {}): Request {
    return {
      cookies,
      headers: { host: 'app.test', 'user-agent': 'test' },
      // What express derives after `trust proxy`; the controller must use
      // these rather than reading X-Forwarded-* itself.
      protocol: 'https',
      host: 'app.test',
      originalUrl: '/api/auth/oidc/callback?code=abc&state=s',
    } as unknown as Request;
  }

  beforeEach(async () => {
    oidcService = { beginLogin: vi.fn(), completeLogin: vi.fn() };
    refreshTokenService = { ttlMs: 1000, issue: vi.fn() };
    res = { cookie: vi.fn(), clearCookie: vi.fn(), redirect: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: {} },
        { provide: OidcService, useValue: oidcService },
        { provide: RefreshTokenService, useValue: refreshTokenService },
        { provide: ConfigService, useValue: { get: vi.fn() } },
      ],
    }).compile();

    controller = module.get(AuthController);
  });

  it('stores the flow in a cookie scoped to the OIDC endpoints', async () => {
    oidcService.beginLogin.mockResolvedValue({ url: 'https://idp/auth', flow });

    await expect(
      controller.oidcLogin(request(), res as unknown as Response),
    ).resolves.toEqual({ url: 'https://idp/auth' });
    expect(oidcService.beginLogin).toHaveBeenCalledWith(
      'https://app.test/api/auth/oidc/callback',
    );
    expect(res.cookie).toHaveBeenCalledWith(
      OIDC_FLOW_COOKIE_NAME,
      JSON.stringify(flow),
      expect.objectContaining({ httpOnly: true, path: '/api/auth/oidc' }),
    );
  });

  it('ignores forwarded headers express did not trust', async () => {
    oidcService.beginLogin.mockResolvedValue({ url: 'https://idp/auth', flow });
    const req = request();
    req.headers['x-forwarded-host'] = 'evil.test';
    req.headers['x-forwarded-proto'] = 'http';

    await controller.oidcLogin(req, res as unknown as Response);

    expect(oidcService.beginLogin).toHaveBeenCalledWith(
      'https://app.test/api/auth/oidc/callback',
    );
  });

  it('answers 404 with a code when OIDC is not configured', async () => {
    oidcService.beginLogin.mockRejectedValue(
      new OidcLoginError('auth.oidcNotConfigured', 'OIDC is not configured'),
    );

    await expect(
      controller.oidcLogin(request(), res as unknown as Response),
    ).rejects.toThrow(NotFoundException);
  });

  it('hands the full callback URL and the flow to the service', async () => {
    oidcService.completeLogin.mockResolvedValue({ id: 'user-1' });
    refreshTokenService.issue.mockResolvedValue('refresh');

    await controller.oidcCallback(
      request({ [OIDC_FLOW_COOKIE_NAME]: JSON.stringify(flow) }),
      res as unknown as Response,
    );

    const [url, passedFlow] = oidcService.completeLogin.mock.calls[0] as [
      URL,
      unknown,
    ];
    expect(url.href).toBe(
      'https://app.test/api/auth/oidc/callback?code=abc&state=s',
    );
    expect(passedFlow).toEqual(flow);
  });

  it('sets the session cookie and redirects without a token in the URL', async () => {
    oidcService.completeLogin.mockResolvedValue({ id: 'user-1' });
    refreshTokenService.issue.mockResolvedValue('refresh');

    await controller.oidcCallback(
      request({ [OIDC_FLOW_COOKIE_NAME]: JSON.stringify(flow) }),
      res as unknown as Response,
    );

    expect(res.cookie).toHaveBeenCalledWith(
      REFRESH_COOKIE_NAME,
      'refresh',
      expect.any(Object),
    );
    expect(res.redirect).toHaveBeenCalledWith('/auth/callback');
    expect(res.clearCookie).toHaveBeenCalledWith(
      OIDC_FLOW_COOKIE_NAME,
      expect.anything(),
    );
  });

  it('redirects to the login screen with the error code on failure', async () => {
    oidcService.completeLogin.mockRejectedValue(
      new OidcLoginError('auth.signupDisabled', 'Signup is currently disabled'),
    );

    await controller.oidcCallback(request(), res as unknown as Response);

    expect(res.redirect).toHaveBeenCalledWith('/login?sso=auth.signupDisabled');
    expect(refreshTokenService.issue).not.toHaveBeenCalled();
    // The flow cookie is single use even when the attempt fails.
    expect(res.clearCookie).toHaveBeenCalledWith(
      OIDC_FLOW_COOKIE_NAME,
      expect.anything(),
    );
  });

  it('redirects with a generic code on an unexpected error', async () => {
    oidcService.completeLogin.mockResolvedValue({ id: 'user-1' });
    refreshTokenService.issue.mockRejectedValue(new Error('database down'));

    await controller.oidcCallback(request(), res as unknown as Response);

    expect(res.redirect).toHaveBeenCalledWith('/login?sso=auth.oidcFailed');
  });
});
