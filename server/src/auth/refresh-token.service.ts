import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { randomBytes, createHash, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * How long after a token is consumed a second presentation of it is still read
 * as a race rather than a theft. A client can legitimately present a consumed
 * token when two windows refresh at once (single-flight only spans one JS
 * context), or when the rotation's response never arrived -- a phone locking
 * mid-request keeps the old cookie. Without this window either of those logs
 * the user out of every device.
 */
const REUSE_GRACE_MS = 30_000;

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
 * that means it was stolen (or replayed), and we revoke the whole family --
 * unless it was consumed moments ago by a rotation, see `REUSE_GRACE_MS`.
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
    db: Pick<PrismaService, 'refreshToken'> = this.prisma,
  ): Promise<string> {
    const rawToken = randomBytes(32).toString('base64url');

    await db.refreshToken.create({
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

    if (existing.revokedAt) {
      if (await this.wasJustRotated(existing.familyId, existing.revokedAt)) {
        // The same client racing itself. Hand it a token in the same family
        // rather than punishing it; the sibling expires on its own.
        const refreshToken = await this.createToken(
          existing.userId,
          existing.familyId,
          userAgent,
        );
        return { userId: existing.userId, refreshToken };
      }

      // Reuse of an already-consumed token means the cookie leaked somewhere.
      // Burn the entire family so the attacker and the victim both get logged out.
      this.logger.warn(
        `Refresh token reuse detected for user ${existing.userId}; revoking family ${existing.familyId}`,
      );
      await this.revokeFamily(existing.familyId);
      throw new UnauthorizedException('Refresh token has already been used');
    }

    if (existing.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    // Claiming and replacing happen in one transaction, and the claim is
    // conditional, so two requests that both read the token as live cannot
    // both consume it. The loser's update waits on the winner's row lock and
    // then matches nothing -- by which point the winner's successor is
    // committed, so going round again lands in the grace path above.
    const refreshToken = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.refreshToken.updateMany({
        where: { id: existing.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (count === 0) return null;
      return this.createToken(
        existing.userId,
        existing.familyId,
        userAgent,
        tx,
      );
    });

    if (refreshToken === null) {
      return this.rotate(rawToken, userAgent);
    }

    return { userId: existing.userId, refreshToken };
  }

  /**
   * Whether a consumed token was consumed by a rotation within the grace
   * window. A rotation always leaves a live successor in the family; a logout
   * revokes the family's only live token and leaves none. Checking for that
   * successor is what stops a token signed out a moment ago from being revived.
   */
  private async wasJustRotated(
    familyId: string,
    revokedAt: Date,
  ): Promise<boolean> {
    if (Date.now() - revokedAt.getTime() > REUSE_GRACE_MS) {
      return false;
    }
    const successor = await this.prisma.refreshToken.findFirst({
      where: {
        familyId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    return successor !== null;
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
