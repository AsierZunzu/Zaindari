import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OidcLoginError, OidcService } from './oidc.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';

const client = vi.hoisted(() => {
  class AuthorizationResponseError extends Error {
    constructor(readonly error: string) {
      super(error);
    }
  }
  return {
    AuthorizationResponseError,
    allowInsecureRequests: Symbol('allowInsecureRequests'),
    discovery: vi.fn(),
    randomState: vi.fn(() => 'state-1'),
    randomNonce: vi.fn(() => 'nonce-1'),
    randomPKCECodeVerifier: vi.fn(() => 'verifier-1'),
    calculatePKCECodeChallenge: vi.fn(() => Promise.resolve('challenge-1')),
    buildAuthorizationUrl: vi.fn(
      (_config: unknown, params: Record<string, string>) =>
        new URL(`https://idp.test/auth?${new URLSearchParams(params)}`),
    ),
    authorizationCodeGrant: vi.fn(),
    fetchUserInfo: vi.fn(),
  };
});

vi.mock('openid-client', () => client);

const oidcRow = {
  id: 'cfg-1',
  name: 'Authentik',
  issuerUrl: 'https://idp.test',
  clientId: 'zaindari',
  clientSecret: 'secret',
  enabled: true,
  createdAt: new Date(0),
  updatedAt: new Date(1000),
};

const flow = { state: 'state-1', nonce: 'nonce-1', codeVerifier: 'verifier-1' };
const callbackUrl = new URL(
  'https://app.test/api/auth/oidc/callback?code=abc&state=state-1',
);

describe('OidcService', () => {
  let service: OidcService;
  let prisma: {
    oidcConfig: { findFirst: ReturnType<typeof vi.fn> };
    user: {
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
      findUniqueOrThrow: ReturnType<typeof vi.fn>;
    };
  };
  let usersService: {
    findByUsername: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  let config: Record<string, unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();
    client.discovery.mockResolvedValue({ provider: 'idp' });
    prisma = {
      oidcConfig: { findFirst: vi.fn().mockResolvedValue(oidcRow) },
      user: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve({ id: where.id, oidcSubject: 'sub-1' }),
        ),
      },
    };
    usersService = {
      findByUsername: vi.fn().mockResolvedValue(null),
      create: vi.fn((data: Record<string, unknown>) =>
        Promise.resolve({ id: 'user-1', ...data }),
      ),
    };
    config = { 'signup.enabled': true, 'admin.bootstrapUsername': '' };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OidcService,
        { provide: PrismaService, useValue: prisma },
        { provide: UsersService, useValue: usersService },
        {
          provide: ConfigService,
          useValue: { get: vi.fn((key: string) => config[key]) },
        },
      ],
    }).compile();

    service = module.get(OidcService);
  });

  function grantReturns(claims: Record<string, unknown>) {
    client.authorizationCodeGrant.mockResolvedValue({
      access_token: 'at',
      claims: () => claims,
    });
  }

  describe('getPublicStatus', () => {
    it('reports the provider name without contacting it', async () => {
      await expect(service.getPublicStatus()).resolves.toEqual({
        enabled: true,
        name: 'Authentik',
      });
      expect(client.discovery).not.toHaveBeenCalled();
    });

    it('prefers the environment over the database row', async () => {
      config.oidc = {
        name: 'From env',
        issuerUrl: 'https://env-idp.test',
        clientId: 'env-client',
        clientSecret: 'env-secret',
      };

      await expect(service.getPublicStatus()).resolves.toEqual({
        enabled: true,
        name: 'From env',
      });
      expect(prisma.oidcConfig.findFirst).not.toHaveBeenCalled();

      await service.beginLogin('https://app.test/cb');
      expect(client.discovery).toHaveBeenCalledWith(
        new URL('https://env-idp.test'),
        'env-client',
        'env-secret',
        undefined,
        undefined,
      );
    });

    it('reports disabled when no enabled row exists', async () => {
      prisma.oidcConfig.findFirst.mockResolvedValue(null);
      await expect(service.getPublicStatus()).resolves.toEqual({
        enabled: false,
        name: null,
      });
    });
  });

  describe('beginLogin', () => {
    it('sends state, nonce and an S256 PKCE challenge, and returns them as the flow', async () => {
      const { url, flow: started } = await service.beginLogin(
        'https://app.test/api/auth/oidc/callback',
      );

      const params = new URL(url).searchParams;
      expect(params.get('state')).toBe('state-1');
      expect(params.get('nonce')).toBe('nonce-1');
      expect(params.get('code_challenge')).toBe('challenge-1');
      expect(params.get('code_challenge_method')).toBe('S256');
      expect(started).toEqual(flow);
    });

    it('caches discovery until the config row changes', async () => {
      await service.beginLogin('https://app.test/cb');
      await service.beginLogin('https://app.test/cb');
      expect(client.discovery).toHaveBeenCalledTimes(1);

      prisma.oidcConfig.findFirst.mockResolvedValue({
        ...oidcRow,
        updatedAt: new Date(2000),
      });
      await service.beginLogin('https://app.test/cb');
      expect(client.discovery).toHaveBeenCalledTimes(2);
    });

    it('does not cache a failed discovery', async () => {
      client.discovery.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      await expect(service.beginLogin('https://app.test/cb')).rejects.toThrow(
        OidcLoginError,
      );
      await expect(
        service.beginLogin('https://app.test/cb'),
      ).resolves.toBeDefined();
      expect(client.discovery).toHaveBeenCalledTimes(2);
    });

    it('allows a plain-HTTP issuer only when the admin configured one', async () => {
      await service.beginLogin('https://app.test/cb');
      expect(client.discovery.mock.calls[0][4]).toBeUndefined();

      prisma.oidcConfig.findFirst.mockResolvedValue({
        ...oidcRow,
        issuerUrl: 'http://keycloak.lan',
        updatedAt: new Date(3000),
      });
      await service.beginLogin('https://app.test/cb');
      expect(client.discovery.mock.calls[1][4]).toEqual({
        execute: [client.allowInsecureRequests],
      });
    });

    it('refuses when OIDC is not configured', async () => {
      prisma.oidcConfig.findFirst.mockResolvedValue(null);
      await expect(
        service.beginLogin('https://app.test/cb'),
      ).rejects.toMatchObject({ code: 'auth.oidcNotConfigured' });
    });
  });

  describe('completeLogin', () => {
    it('validates the callback against the stored flow', async () => {
      grantReturns({ sub: 'sub-1', preferred_username: 'asier' });
      client.fetchUserInfo.mockResolvedValue({ sub: 'sub-1' });

      await service.completeLogin(callbackUrl, flow);

      expect(client.authorizationCodeGrant).toHaveBeenCalledWith(
        expect.anything(),
        callbackUrl,
        {
          expectedState: 'state-1',
          expectedNonce: 'nonce-1',
          pkceCodeVerifier: 'verifier-1',
        },
      );
      // Userinfo must belong to the same subject as the ID token.
      expect(client.fetchUserInfo).toHaveBeenCalledWith(
        expect.anything(),
        'at',
        'sub-1',
      );
    });

    it('refuses a callback with no sign-in attempt behind it', async () => {
      await expect(
        service.completeLogin(callbackUrl, undefined),
      ).rejects.toMatchObject({ code: 'auth.oidcFailed' });
      expect(client.authorizationCodeGrant).not.toHaveBeenCalled();
    });

    it('maps a cancelled sign-in to oidcDenied', async () => {
      client.authorizationCodeGrant.mockRejectedValue(
        new client.AuthorizationResponseError('access_denied'),
      );
      await expect(
        service.completeLogin(callbackUrl, flow),
      ).rejects.toMatchObject({ code: 'auth.oidcDenied' });
    });

    it('maps a failed check (e.g. state mismatch) to oidcFailed', async () => {
      client.authorizationCodeGrant.mockRejectedValue(
        new Error('unexpected "state" response parameter value'),
      );
      await expect(
        service.completeLogin(callbackUrl, flow),
      ).rejects.toMatchObject({ code: 'auth.oidcFailed' });
    });

    it('lets ID token claims win over userinfo', async () => {
      grantReturns({ sub: 'sub-1', preferred_username: 'asier' });
      client.fetchUserInfo.mockResolvedValue({
        sub: 'sub-1',
        preferred_username: 'someone-else',
        name: 'Asier Z',
      });

      await service.completeLogin(callbackUrl, flow);

      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'asier',
          displayName: 'Asier Z',
          oidcSubject: 'sub-1',
        }),
      );
    });

    it('still signs in when userinfo is unavailable', async () => {
      grantReturns({ sub: 'sub-1', email: 'a@example.com' });
      client.fetchUserInfo.mockRejectedValue(new Error('404'));

      await expect(
        service.completeLogin(callbackUrl, flow),
      ).resolves.toMatchObject({
        username: 'a@example.com',
        email: 'a@example.com',
      });
    });
  });

  describe('findOrCreateUser', () => {
    it('returns the linked account without creating one', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'existing' });
      config['signup.enabled'] = false;

      await expect(service.findOrCreateUser('sub-1', {})).resolves.toEqual({
        id: 'existing',
      });
      expect(usersService.create).not.toHaveBeenCalled();
    });

    it('refuses to create an account while signup is disabled', async () => {
      config['signup.enabled'] = false;
      await expect(
        service.findOrCreateUser('sub-1', { preferred_username: 'asier' }),
      ).rejects.toMatchObject({ code: 'auth.signupDisabled' });
      expect(usersService.create).not.toHaveBeenCalled();
    });

    it('still creates the bootstrap admin while signup is disabled', async () => {
      config['signup.enabled'] = false;
      config['admin.bootstrapUsername'] = 'asier';

      await service.findOrCreateUser('sub-1', { preferred_username: 'asier' });
      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'asier', isAdmin: true }),
      );
    });

    it('deduplicates a taken username', async () => {
      // `asier` is taken; the default null then frees `asier_1`.
      usersService.findByUsername.mockResolvedValueOnce({ id: 'other' });
      await service.findOrCreateUser('sub-1', { preferred_username: 'asier' });
      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'asier_1' }),
      );
    });

    it('ignores non-string claims', async () => {
      await service.findOrCreateUser('abcdefghij', {
        preferred_username: 42,
        email: { not: 'a string' },
      });
      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'oidc_abcdefgh',
          email: undefined,
        }),
      );
    });
  });

  describe('linking by email', () => {
    const local = { id: 'local-1', email: 'Asier@Example.com' };

    beforeEach(() => {
      prisma.user.findMany.mockResolvedValue([local]);
    });

    it('links a verified email to the unlinked account that has it', async () => {
      await expect(
        service.findOrCreateUser('sub-1', {
          email: 'asier@example.com',
          email_verified: true,
        }),
      ).resolves.toMatchObject({ id: 'local-1' });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { oidcSubject: null, email: { not: null } },
        }),
      );
      // Conditional on still being unlinked, so a racing sign-in can't steal it.
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'local-1', oidcSubject: null },
        data: { oidcSubject: 'sub-1' },
      });
      expect(usersService.create).not.toHaveBeenCalled();
    });

    it('links even while signup is disabled, since no account is created', async () => {
      config['signup.enabled'] = false;
      await expect(
        service.findOrCreateUser('sub-1', {
          email: 'asier@example.com',
          email_verified: true,
        }),
      ).resolves.toMatchObject({ id: 'local-1' });
    });

    it.each([
      ['missing', {}],
      ['false', { email_verified: false }],
      ['a string', { email_verified: 'true' }],
    ])(
      'does not link when email_verified is %s',
      async (_label, verification) => {
        await service.findOrCreateUser('sub-1', {
          email: 'asier@example.com',
          ...verification,
        });
        expect(prisma.user.updateMany).not.toHaveBeenCalled();
        expect(usersService.create).toHaveBeenCalled();
      },
    );

    it('links an unverified email when the env opts in', async () => {
      config['oidc.trustUnverifiedEmail'] = true;
      await expect(
        service.findOrCreateUser('sub-1', { email: 'asier@example.com' }),
      ).resolves.toMatchObject({ id: 'local-1' });
      expect(usersService.create).not.toHaveBeenCalled();
    });

    it('links nothing when the email is shared by several accounts', async () => {
      prisma.user.findMany.mockResolvedValue([
        local,
        { id: 'local-2', email: 'asier@example.com' },
      ]);
      await service.findOrCreateUser('sub-1', {
        email: 'asier@example.com',
        email_verified: true,
      });
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(usersService.create).toHaveBeenCalled();
    });

    it('falls back to creating an account when it lost the race to link', async () => {
      prisma.user.updateMany.mockResolvedValue({ count: 0 });
      await service.findOrCreateUser('sub-1', {
        email: 'asier@example.com',
        email_verified: true,
      });
      expect(usersService.create).toHaveBeenCalled();
    });

    it('prefers the account already linked to the subject', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'linked' });
      await expect(
        service.findOrCreateUser('sub-1', {
          email: 'asier@example.com',
          email_verified: true,
        }),
      ).resolves.toEqual({ id: 'linked' });
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });
  });
});
