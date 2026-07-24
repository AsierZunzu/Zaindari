import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { localeFromAcceptLanguage, resolveLocale } from '../i18n/messages.js';
import type { User } from '@prisma/client';

@Injectable()
export class OidcService {
  private readonly logger = new Logger(OidcService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async getOidcConfig() {
    return this.prisma.oidcConfig.findFirst({
      where: { enabled: true },
    });
  }

  async getAuthorizationUrl(redirectUri: string): Promise<string> {
    const config = await this.getOidcConfig();
    if (!config) {
      throw new NotFoundException('OIDC is not configured');
    }

    const { discovery, buildAuthorizationUrl, randomState, randomNonce } =
      await import('openid-client');

    const oidcConfig = await discovery(
      new URL(config.issuerUrl),
      config.clientId,
      config.clientSecret,
    );

    const state = randomState();
    const nonce = randomNonce();

    const authUrl = buildAuthorizationUrl(oidcConfig, {
      redirect_uri: redirectUri,
      scope: 'openid profile email',
      state,
      nonce,
    });

    return authUrl.href;
  }

  async handleCallback(
    code: string,
    redirectUri: string,
    acceptLanguage?: string,
  ): Promise<{ accessToken: string; user: Omit<User, 'passwordHash'> }> {
    const config = await this.getOidcConfig();
    if (!config) {
      throw new NotFoundException('OIDC is not configured');
    }

    try {
      const { discovery, authorizationCodeGrant, fetchUserInfo } =
        await import('openid-client');

      const oidcConfig = await discovery(
        new URL(config.issuerUrl),
        config.clientId,
        config.clientSecret,
      );

      const currentUrl = new URL(`${redirectUri}?code=${code}`);

      const tokens = await authorizationCodeGrant(oidcConfig, currentUrl, {
        idTokenExpected: false,
      });

      const claims = tokens.claims();
      let sub = claims?.sub;

      // Try to get userinfo for more details
      let userInfo: Record<string, unknown> = {};
      try {
        const info = await fetchUserInfo(
          oidcConfig,
          tokens.access_token,
          sub || 'unknown',
        );
        userInfo = info;
        if (!sub && userInfo.sub) sub = userInfo.sub as string;
      } catch (e) {
        this.logger.warn('Could not fetch userinfo, using token claims', e);
        userInfo = (claims as unknown as Record<string, unknown>) ?? {};
      }

      if (!sub) {
        throw new InternalServerErrorException(
          'OIDC provider did not return a subject',
        );
      }

      const user = await this.findOrCreateUser(sub, userInfo, acceptLanguage);
      const { passwordHash, ...profile } = user;

      const payload = {
        sub: user.id,
        username: user.username,
        isAdmin: user.isAdmin,
      };

      return {
        accessToken: this.jwtService.sign(payload),
        user: profile,
      };
    } catch (error) {
      this.logger.error('OIDC callback error', error);
      if (
        error instanceof NotFoundException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'OIDC authentication failed: ' +
          (error instanceof Error ? error.message : 'Unknown error'),
      );
    }
  }

  async findOrCreateUser(
    oidcSubject: string,
    userInfo: Record<string, unknown>,
    acceptLanguage?: string,
  ): Promise<User> {
    // Try to find existing user by oidcSubject
    const existing = await this.prisma.user.findFirst({
      where: { oidcSubject },
    });

    if (existing) {
      return existing;
    }

    // Create a new user
    const preferredUsername =
      (userInfo.preferred_username as string) ||
      (userInfo.email as string) ||
      `oidc_${oidcSubject.substring(0, 8)}`;
    const displayName = (userInfo.name as string) || preferredUsername;
    const email = (userInfo.email as string) || undefined;

    // Make username unique if needed
    let username = preferredUsername;
    let counter = 1;
    while (await this.usersService.findByUsername(username)) {
      username = `${preferredUsername}_${counter}`;
      counter++;
    }

    return this.usersService.create({
      username,
      displayName,
      email,
      oidcSubject,
      // The `locale` claim is part of OIDC standard claims, so prefer the
      // identity provider's answer and fall back to the browser's header.
      locale: userInfo.locale
        ? resolveLocale(userInfo.locale as string)
        : localeFromAcceptLanguage(acceptLanguage),
    });
  }
}
