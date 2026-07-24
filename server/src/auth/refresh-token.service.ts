import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { randomBytes, createHash, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Opaque, database-backed refresh tokens with rotation and reuse detection.
 *
 * The raw token is a 256-bit random value that only ever exists in the client's
 * httpOnly cookie. We persist a SHA-256 hash of it, so a database leak cannot be
 * replayed against the API. (SHA-256 rather than bcrypt is deliberate: the token
 * is high-entropy random, not a guessable password, so there is nothing to
 * brute-force and we avoid a slow hash on every refresh.)
 *
 * Rotation: every refresh consumes the presented token and issues a new one in
 * the same "family". If a token that has already been consumed shows up again,
 * that means it was stolen (or replayed), and we revoke the whole family.
 */
@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /** Lifetime of a refresh token, in milliseconds. */
  get ttlMs(): number {
    const days =
      this.configService.get<number>('jwt.refreshExpirationDays') ?? 30;
    return days * 24 * 60 * 60 * 1000;
  }

  private hash(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  /** Issues a brand new token family. Used at login / register / OIDC callback. */
  async issue(userId: string, userAgent?: string): Promise<string> {
    return this.createToken(userId, randomUUID(), userAgent);
  }

  private async createToken(
    userId: string,
    familyId: string,
    userAgent?: string,
  ): Promise<string> {
    const rawToken = randomBytes(32).toString('base64url');

    await this.prisma.refreshToken.create({
      data: {
        tokenHash: this.hash(rawToken),
        userId,
        familyId,
        userAgent: userAgent?.slice(0, 255),
        expiresAt: new Date(Date.now() + this.ttlMs),
      },
    });

    return rawToken;
  }

  /**
   * Validates and consumes a refresh token, returning the user id and a fresh
   * token. Sliding expiry: the replacement gets a full TTL from now, so an
   * actively used session never expires.
   */
  async rotate(
    rawToken: string,
    userAgent?: string,
  ): Promise<{ userId: string; refreshToken: string }> {
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hash(rawToken) },
    });

    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Reuse of an already-consumed token means the cookie leaked somewhere.
    // Burn the entire family so the attacker and the victim both get logged out.
    if (existing.revokedAt) {
      this.logger.warn(
        `Refresh token reuse detected for user ${existing.userId}; revoking family ${existing.familyId}`,
      );
      await this.revokeFamily(existing.familyId);
      throw new UnauthorizedException('Refresh token has already been used');
    }

    if (existing.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });

    const refreshToken = await this.createToken(
      existing.userId,
      existing.familyId,
      userAgent,
    );

    return { userId: existing.userId, refreshToken };
  }

  /** Revokes a single token. Used on explicit logout. */
  async revoke(rawToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hash(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Signs the user out of every device. */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Drops rows that can no longer authenticate anyone. Revoked tokens are kept
   * until they expire so that reuse detection still has something to match.
   */
  @Cron('0 4 * * *')
  async purgeExpired(): Promise<number> {
    const { count } = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (count > 0) {
      this.logger.log(`Purged ${count} expired refresh token(s)`);
    }
    return count;
  }
}
