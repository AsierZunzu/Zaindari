import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Req,
  Res,
  UseGuards,
  NotFoundException,
  UnauthorizedException,
  HttpCode,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { OidcService } from './oidc.service.js';
import { RefreshTokenService } from './refresh-token.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { JwtAuthGuard } from '../common/guards/auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import {
  setRefreshCookie,
  clearRefreshCookie,
  readRefreshCookie,
} from './session-cookie.js';
import type { User } from '@prisma/client';

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
      // The cookie is dead; stop the browser from replaying it forever.
      clearRefreshCookie(req, res, this.configuredSecure);
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

  @Get('oidc')
  async oidcLogin(@Req() req: Request) {
    const config = await this.oidcService.getOidcConfig();
    if (!config) {
      throw new NotFoundException('OIDC is not configured');
    }

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const redirectUri = `${protocol}://${host}/api/auth/oidc/callback`;

    const authorizationUrl =
      await this.oidcService.getAuthorizationUrl(redirectUri);
    return { url: authorizationUrl };
  }

  @Get('oidc/callback')
  async oidcCallback(
    @Query('code') code: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const redirectUri = `${protocol}://${host}/api/auth/oidc/callback`;

    const result = await this.oidcService.handleCallback(
      code,
      redirectUri,
      req.headers['accept-language'],
    );

    const refreshToken = await this.refreshTokenService.issue(
      result.user.id,
      req.headers['user-agent'],
    );
    this.attachSession(req, res, refreshToken);

    // Redirect to frontend with token
    const frontendUrl = `/auth/callback?token=${encodeURIComponent(result.accessToken)}`;
    res.redirect(frontendUrl);
  }
}
