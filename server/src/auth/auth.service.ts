import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service.js';
import { RefreshTokenService } from './refresh-token.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { User } from '@prisma/client';
import { apiError, ERROR_CODES } from '../common/errors/api-error.js';
import { localeFromAcceptLanguage } from '../i18n/messages.js';
import { grantsAdmin } from './admin-bootstrap.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  async register(
    dto: RegisterDto,
    userAgent?: string,
    acceptLanguage?: string,
  ) {
    const signupEnabled = this.configService.get<boolean>('signup.enabled');
    if (!signupEnabled) {
      throw new ForbiddenException(
        apiError(ERROR_CODES.signupDisabled, 'Signup is currently disabled'),
      );
    }

    const existing = await this.usersService.findByUsername(dto.username);
    if (existing) {
      throw new ConflictException(
        apiError(ERROR_CODES.usernameTaken, 'Username already taken'),
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.create({
      username: dto.username,
      displayName: dto.displayName,
      email: dto.email,
      passwordHash,
      isAdmin: grantsAdmin(
        dto.username,
        this.configService.get<string>('admin.bootstrapUsername') ?? '',
      ),
      // Seeded from the browser so a new account opens in the language the
      // user is already reading in; changeable in Settings afterwards.
      locale: localeFromAcceptLanguage(acceptLanguage),
    });

    return this.buildAuthResponse(user, userAgent);
  }

  async validateUser(username: string, password: string): Promise<User> {
    const user = await this.usersService.findByUsername(username);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException(
        apiError(ERROR_CODES.invalidCredentials, 'Invalid credentials'),
      );
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException(
        apiError(ERROR_CODES.invalidCredentials, 'Invalid credentials'),
      );
    }

    return user;
  }

  async login(username: string, password: string, userAgent?: string) {
    const user = await this.validateUser(username, password);
    return this.buildAuthResponse(user, userAgent);
  }

  /**
   * Exchanges a refresh token for a new access token, rotating the refresh
   * token in the process. Deliberately does NOT require a valid access token —
   * this is the only path that can rescue an expired session.
   */
  async refresh(rawRefreshToken: string, userAgent?: string) {
    const { userId, refreshToken } = await this.refreshTokenService.rotate(
      rawRefreshToken,
      userAgent,
    );

    const user = await this.usersService.findById(userId);
    if (!user) {
      // The account was deleted while the session was still alive.
      await this.refreshTokenService.revokeAllForUser(userId);
      throw new UnauthorizedException('User not found');
    }

    return {
      accessToken: this.generateAccessToken(user),
      refreshToken,
    };
  }

  async logout(rawRefreshToken?: string) {
    if (rawRefreshToken) {
      await this.refreshTokenService.revoke(rawRefreshToken);
    }
  }

  async buildAuthResponse(user: User, userAgent?: string) {
    const { passwordHash, ...profile } = user;
    return {
      accessToken: this.generateAccessToken(user),
      refreshToken: await this.refreshTokenService.issue(user.id, userAgent),
      user: profile,
    };
  }

  private generateAccessToken(user: User): string {
    const payload = {
      sub: user.id,
      username: user.username,
      isAdmin: user.isAdmin,
    };
    return this.jwtService.sign(payload);
  }
}
