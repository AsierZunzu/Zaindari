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
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { OidcService } from './oidc.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { JwtAuthGuard } from '../common/guards/auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { User } from '@prisma/client';

@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly oidcService: OidcService,
  ) {}

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.username, dto.password);
  }

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('refresh')
  @UseGuards(JwtAuthGuard)
  async refresh(@CurrentUser() user: User) {
    return this.authService.refresh(user.id);
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

    const result = await this.oidcService.handleCallback(code, redirectUri);

    // Redirect to frontend with token
    const frontendUrl = `/auth/callback?token=${encodeURIComponent(result.accessToken)}`;
    res.redirect(frontendUrl);
  }
}
