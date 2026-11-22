import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Configuration } from 'openid-client';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { localeFromAcceptLanguage, resolveLocale } from '../i18n/messages.js';
import { ERROR_CODES, type ErrorCode } from '../common/errors/api-error.js';
import { grantsAdmin } from './admin-bootstrap.js';
import { resolveEnvOidcConfig, type OidcEnv } from './oidc-env.js';
import type { OidcFlow } from './session-cookie.js';
import type { OidcConfig, User } from '@prisma/client';

/**
 * A sign-in that did not complete. The callback is a top-level navigation, so
 * there is no JSON consumer to hand an exception to; the controller turns the
 * code into a redirect back to the login screen, which words it.
 */
export class OidcLoginError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'OidcLoginError';
  }
}

function stringClaim(
  claims: Record<string, unknown>,
  name: string,
): string | undefined {
  const value = claims[name];
  return typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : undefined;
}

@Injectable()
export class OidcService {
  private readonly logger = new Logger(OidcService.name);

  /**
   * Discovery is a network round trip to the provider. Caching it keyed on the
   * row's `updatedAt` means an admin's edit takes effect on the next sign-in
   * without any explicit invalidation.
   */
  private discovered: { key: string; config: Promise<Configuration> } | null =
    null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  /** The environment's provider when one is set, else the admin panel's row. */
  async getOidcConfig(): Promise<OidcConfig | null> {
    const fromEnv = resolveEnvOidcConfig(
      this.configService.get<OidcEnv>('oidc') ?? {},
    );
    if (fromEnv) return fromEnv;

    return this.prisma.oidcConfig.findFirst({
      where: { enabled: true },
    });
  }

  /**
   * What the login screen needs to decide whether to offer SSO. Deliberately
   * touches only the database: the screen asks on every visit, and a provider
   * that is down must not slow the local login form.
   */
  async getPublicStatus(): Promise<{ enabled: boolean; name: string | null }> {
    const config = await this.getOidcConfig();
    return config
      ? { enabled: true, name: config.name }
      : { enabled: false, name: null };
  }

  private async discover(config: OidcConfig): Promise<Configuration> {
    const key = `${config.id}:${config.updatedAt.getTime()}`;
    if (this.discovered?.key !== key) {
      const client = await import('openid-client');
      const issuer = new URL(config.issuerUrl);
      const pending = client.discovery(
        issuer,
        config.clientId,
        config.clientSecret,
        undefined,
        // Self-hosted providers on a LAN are often plain HTTP; openid-client
        // refuses that unless told otherwise. The admin typed the URL, so an
        // http:// issuer is a decision, not an accident.
        issuer.protocol === 'http:'
          ? { execute: [client.allowInsecureRequests] }
          : undefined,
      );
      this.discovered = { key, config: pending };
      // A failed discovery (provider briefly down) must not stick.
      pending.catch(() => {
        if (this.discovered?.config === pending) this.discovered = null;
      });
    }
    return this.discovered.config;
  }

  private async requireConfig(): Promise<OidcConfig> {
    const config = await this.getOidcConfig();
    if (!config) {
      throw new OidcLoginError(
        ERROR_CODES.oidcNotConfigured,
        'OIDC is not configured',
      );
    }
    return config;
  }

  /**
   * Starts a sign-in. The returned `flow` must reach the callback unchanged
   * (the controller carries it in a cookie) — it is what proves the callback
   * belongs to this attempt.
   */
  async beginLogin(
    redirectUri: string,
  ): Promise<{ url: string; flow: OidcFlow }> {
    const config = await this.requireConfig();
    const client = await import('openid-client');

    let oidcConfig: Configuration;
    try {
      oidcConfig = await this.discover(config);
    } catch (error) {
      this.logger.error('OIDC discovery failed', error);
      throw new OidcLoginError(
        ERROR_CODES.oidcFailed,
        'Could not reach the OIDC provider',
      );
    }

    const flow: OidcFlow = {
      state: client.randomState(),
      nonce: client.randomNonce(),
      codeVerifier: client.randomPKCECodeVerifier(),
    };

    const url = client.buildAuthorizationUrl(oidcConfig, {
      redirect_uri: redirectUri,
      scope: 'openid profile email',
      state: flow.state,
      nonce: flow.nonce,
      code_challenge: await client.calculatePKCECodeChallenge(
        flow.codeVerifier,
      ),
      code_challenge_method: 'S256',
    });

    return { url: url.href, flow };
  }

  /**
   * Redeems the provider's callback for a local account.
   *
   * `callbackUrl` is the full URL the provider redirected to, query string
   * included: openid-client validates `state`, `iss` and any `error` straight
   * from it, so reconstructing it from `code` alone would skip those checks.
   */
  async completeLogin(
    callbackUrl: URL,
    flow: OidcFlow | undefined,
    acceptLanguage?: string,
  ): Promise<User> {
    const config = await this.requireConfig();

    if (!flow) {
      // No cookie: the attempt expired, was started in another browser, or
      // this is a forged callback. All three must be refused the same way.
      throw new OidcLoginError(
        ERROR_CODES.oidcFailed,
        'OIDC callback without a matching sign-in attempt',
      );
    }

    const client = await import('openid-client');
    let claims: Record<string, unknown>;
    try {
      const oidcConfig = await this.discover(config);
      const tokens = await client.authorizationCodeGrant(
        oidcConfig,
        callbackUrl,
        {
          expectedState: flow.state,
          expectedNonce: flow.nonce,
          pkceCodeVerifier: flow.codeVerifier,
        },
      );

      // expectedNonce makes the ID token mandatory, so claims() is defined;
      // the subject from it is the identity, userinfo only adds profile.
      const idClaims = tokens.claims()!;
      claims = { ...idClaims };
      try {
        const info = await client.fetchUserInfo(
          oidcConfig,
          tokens.access_token,
          idClaims.sub,
        );
        claims = { ...info, ...idClaims };
      } catch (e) {
        this.logger.warn('Could not fetch userinfo, using ID token claims', e);
      }
    } catch (error) {
      if (error instanceof client.AuthorizationResponseError) {
        // The provider said no (the user cancelled, or isn't allowed in).
        throw new OidcLoginError(
          error.error === 'access_denied'
            ? ERROR_CODES.oidcDenied
            : ERROR_CODES.oidcFailed,
          `OIDC provider returned ${error.error}`,
        );
      }
      this.logger.error('OIDC callback error', error);
      throw new OidcLoginError(
        ERROR_CODES.oidcFailed,
        'OIDC authentication failed: ' +
          (error instanceof Error ? error.message : 'Unknown error'),
      );
    }

    const sub = stringClaim(claims, 'sub');
    if (!sub) {
      throw new OidcLoginError(
        ERROR_CODES.oidcFailed,
        'OIDC provider did not return a subject',
      );
    }

    return this.findOrCreateUser(sub, claims, acceptLanguage);
  }

  async findOrCreateUser(
    oidcSubject: string,
    userInfo: Record<string, unknown>,
    acceptLanguage?: string,
  ): Promise<User> {
    const existing = await this.prisma.user.findFirst({
      where: { oidcSubject },
    });

    if (existing) {
      return existing;
    }

    const linked = await this.linkByEmail(oidcSubject, userInfo);
    if (linked) {
      return linked;
    }

    const preferredUsername =
      stringClaim(userInfo, 'preferred_username') ??
      stringClaim(userInfo, 'email') ??
      `oidc_${oidcSubject.substring(0, 8)}`;
    const displayName = stringClaim(userInfo, 'name') ?? preferredUsername;
    const email = stringClaim(userInfo, 'email');

    // Make username unique if needed
    let username = preferredUsername;
    let counter = 1;
    while (await this.usersService.findByUsername(username)) {
      username = `${preferredUsername}_${counter}`;
      counter++;
    }

    // Matched against the deduplicated name, not the provider's preferred
    // one: if the bootstrap username is already taken this account lands as
    // `<name>_1`, and it must not inherit admin on the strength of a claim
    // it lost.
    const isAdmin = grantsAdmin(
      username,
      this.configService.get<string>('admin.bootstrapUsername') ?? '',
    );

    // A first OIDC login creates an account, so it is a signup and the admin's
    // switch applies — otherwise a public provider would let anyone in. The
    // bootstrap admin is exempt: an OIDC-only install with signup off would
    // have no way to create its first admin.
    if (!isAdmin && !this.configService.get<boolean>('signup.enabled')) {
      throw new OidcLoginError(
        ERROR_CODES.signupDisabled,
        'Signup is currently disabled',
      );
    }

    return this.usersService.create({
      username,
      displayName,
      email,
      oidcSubject,
      isAdmin,
      // The `locale` claim is part of OIDC standard claims, so prefer the
      // identity provider's answer and fall back to the browser's header.
      locale: stringClaim(userInfo, 'locale')
        ? resolveLocale(stringClaim(userInfo, 'locale'))
        : localeFromAcceptLanguage(acceptLanguage),
    });
  }

  /**
   * Attaches a first OIDC sign-in to an existing local account with the same
   * email, so someone created by an admin (or who registered before SSO was
   * set up) keeps their garden instead of getting a second, empty account.
   *
   * The email claim is the whole proof of ownership here, which is why it
   * must be one the provider has verified: otherwise anyone who can set an
   * arbitrary address at the provider takes over the matching account,
   * admins included. `ZAINDARI_OIDC_TRUST_UNVERIFIED_EMAIL` waives that for
   * providers that never send `email_verified` but do control addresses.
   *
   * Only accounts not yet linked are candidates — an account already tied to
   * one subject is never handed to another — and an address shared by more
   * than one account is ambiguous, so it links nothing.
   */
  private async linkByEmail(
    oidcSubject: string,
    userInfo: Record<string, unknown>,
  ): Promise<User | null> {
    const email = stringClaim(userInfo, 'email')?.toLowerCase();
    if (!email) return null;

    const verified = userInfo.email_verified === true;
    if (
      !verified &&
      !this.configService.get<boolean>('oidc.trustUnverifiedEmail')
    ) {
      return null;
    }

    // Compared in JS rather than in the query: emails are matched
    // case-insensitively, and Prisma has no portable case-insensitive
    // equality. The candidate set is the unlinked accounts of one household.
    const candidates = await this.prisma.user.findMany({
      where: { oidcSubject: null, email: { not: null } },
      select: { id: true, email: true },
    });
    const matches = candidates.filter(
      (user) => user.email?.trim().toLowerCase() === email,
    );
    if (matches.length !== 1) {
      if (matches.length > 1) {
        this.logger.warn(
          `Not linking OIDC subject: ${matches.length} accounts share its email`,
        );
      }
      return null;
    }

    // Conditional on still being unlinked, so two first sign-ins racing for
    // the same account cannot both claim it.
    const { count } = await this.prisma.user.updateMany({
      where: { id: matches[0].id, oidcSubject: null },
      data: { oidcSubject },
    });
    if (count !== 1) return null;

    this.logger.log(`Linked OIDC subject to existing user ${matches[0].id}`);
    return this.prisma.user.findUniqueOrThrow({ where: { id: matches[0].id } });
  }
}
