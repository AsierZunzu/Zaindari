import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  UseGuards,
  BadGatewayException,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  HttpCode,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { OidcLoginError, OidcService } from './oidc.service.js';
import { apiError, ERROR_CODES } from '../common/errors/api-error.js';
import { RefreshTokenService } from './refresh-token.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { JwtAuthGuard } from '../common/guards/auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import {
  setRefreshCookie,
  clearRefreshCookie,
  readRefreshCookie,
  setOidcFlowCookie,
  clearOidcFlowCookie,
  readOidcFlowCookie,
} from './session-cookie.js';
import type { User } from '@prisma/client';

// The OIDC spec requires the redirect_uri presented at /oidc and the one sent
// back at /oidc/callback to match exactly, so both derive it from here rather
// than rebuilding the string twice.
//
// `req.protocol` and `req.host` read X-Forwarded-Proto/-Host only as far as
// `trust proxy` (main.ts) allows, so a client cannot steer the redirect_uri
// past the proxy hop the deployment actually has. Express 5's `req.host`
// keeps the port, which a LAN install on :3000 needs.
function resolveOidcRedirectUri(req: Request): string {
  const protocol = req.protocol;
  const host = req.host;
  if (!host) {
    throw new BadRequestException('Cannot determine the OIDC callback host');
  }
  return `${protocol}://${host}/api/auth/oidc/callback`;
}

@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly oidcService: OidcService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly configService: ConfigService,
  ) {}

  private get configuredSecure(): string {
    return this.configService.get<string>('cookies.secure') ?? 'auto';
  }

  private attachSession(req: Request, res: Response, refreshToken: string) {
    setRefreshCookie(
      req,
      res,
      refreshToken,
      this.refreshTokenService.ttlMs,
      this.configuredSecure,
    );
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { refreshToken, ...response } = await this.authService.login(
      dto.username,
      dto.password,
      req.headers['user-agent'],
    );
    this.attachSession(req, res, refreshToken);
    return response;
  }

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { refreshToken, ...response } = await this.authService.register(
      dto,
      req.headers['user-agent'],
      req.headers['accept-language'],
    );
    this.attachSession(req, res, refreshToken);
    return response;
  }

  /**
   * Unguarded on purpose. The httpOnly refresh cookie is the credential here —
   * requiring a valid access token would make this endpoint useless at exactly
   * the moment it is needed (after the access token has expired).
   */
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken = readRefreshCookie(req);
    if (!rawToken) {
      throw new UnauthorizedException('No refresh token');
    }

    try {
      const { accessToken, refreshToken } = await this.authService.refresh(
        rawToken,
        req.headers['user-agent'],
      );
      this.attachSession(req, res, refreshToken);
      return { accessToken };
    } catch (error) {
      // Only a rejected token means the cookie is dead; then stop the browser
      // from replaying it forever. Anything else (the database restarting, a
      // dropped connection) says nothing about the token, and clearing the
      // cookie would turn a brief outage into a forced logout.
      if (error instanceof UnauthorizedException) {
        clearRefreshCookie(req, res, this.configuredSecure);
      }
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(readRefreshCookie(req));
    clearRefreshCookie(req, res, this.configuredSecure);
  }

  /** Signs the current user out everywhere, e.g. after a password change. */
  @Post('logout-all')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async logoutAll(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.refreshTokenService.revokeAllForUser(user.id);
    clearRefreshCookie(req, res, this.configuredSecure);
  }

  /** Whether the login screen should offer SSO, and under what name. */
  @Get('oidc/status')
  oidcStatus() {
    return this.oidcService.getPublicStatus();
  }

  @Get('oidc')
  async oidcLogin(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const redirectUri = resolveOidcRedirectUri(req);

    try {
      const { url, flow } = await this.oidcService.beginLogin(redirectUri);
      setOidcFlowCookie(req, res, flow, this.configuredSecure);
      return { url };
    } catch (error) {
      if (!(error instanceof OidcLoginError)) throw error;
      const body = apiError(error.code, error.message);
      throw error.code === ERROR_CODES.oidcNotConfigured
        ? new NotFoundException(body)
        : new BadGatewayException(body);
    }
  }

  /**
   * Where the provider sends the browser back. This is a page load, not an
   * XHR, so every outcome ends in a redirect into the SPA: a thrown exception
   * would strand the user on a JSON error body.
   *
   * The access token is deliberately not in the redirect URL — it would land
   * in browser history and proxy logs. Only the httpOnly refresh cookie is set
   * here, and `/auth/callback` exchanges it the same way a reload would.
   */
  @Get('oidc/callback')
  async oidcCallback(@Req() req: Request, @Res() res: Response) {
    const flow = readOidcFlowCookie(req);
    // Single use, whatever happens next: a replayed callback must not find it.
    clearOidcFlowCookie(req, res, this.configuredSecure);

    try {
      const callbackUrl = new URL(resolveOidcRedirectUri(req));
      callbackUrl.search = new URL(req.originalUrl, callbackUrl).search;

      const user = await this.oidcService.completeLogin(
        callbackUrl,
        flow,
        req.headers['accept-language'],
      );

      const refreshToken = await this.refreshTokenService.issue(
        user.id,
        req.headers['user-agent'],
      );
      this.attachSession(req, res, refreshToken);
      res.redirect('/auth/callback');
    } catch (error) {
      // A refusal is expected (signup off, access denied) but an admin still
      // needs to see why someone could not get in; the code says it without
      // putting anyone's claims in the log.
      if (error instanceof OidcLoginError) {
        Logger.warn(
          `OIDC sign-in refused: ${error.code} (${error.message})`,
          AuthController.name,
        );
      } else {
        Logger.error('OIDC callback failed', error, AuthController.name);
      }
      const code =
        error instanceof OidcLoginError ? error.code : ERROR_CODES.oidcFailed;
      res.redirect(`/login?sso=${encodeURIComponent(code)}`);
    }
  }
}
