import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { randomBytes, createHash, randomUUID } from 'crypto';
import type { RefreshToken } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * How long a just-rotated token is still accepted, re-issued rather than
 * treated as stolen. Long enough to cover a retried request or a second tab
 * racing the first; short enough that a token lifted from a cookie jar is
 * still caught by reuse detection.
 */
const REUSE_GRACE_MS = 60_000;

/** The prisma client or a transaction on it — whichever the write belongs to. */
type TokenStore = Pick<PrismaService, 'refreshToken'>;

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
 * that means it was stolen (or replayed), and we revoke the whole family —
 * unless it was consumed within the last REUSE_GRACE_MS, which is what a lost
 * response looks like.
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
    return this.createToken(this.prisma, userId, randomUUID(), userAgent);
  }

  private async createToken(
    db: TokenStore,
    userId: string,
    familyId: string,
    userAgent?: string,
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
      // A token rotated moments ago is far more likely a lost response than a
      // theft: a container killed mid-refresh, or two tabs sharing one cookie
      // jar refreshing at once. Either way the browser never got the
      // replacement, and burning the family would sign the user out of a
      // session nobody stole.
      if (await this.wasJustRotated(existing)) {
        return this.replace(existing, userAgent);
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

    return this.replace(existing, userAgent);
  }

  /**
   * True when a revoked token was consumed by rotation within the grace window.
   *
   * `revokedAt` alone can't tell rotation from logout or a theft response, so
   * this also requires the family to still hold a live token. Rotation always
   * leaves a successor behind; logout, logout-all and reuse detection leave
   * none, so a token they killed never comes back through here.
   */
  private async wasJustRotated(token: RefreshToken): Promise<boolean> {
    if (Date.now() - token.revokedAt!.getTime() > REUSE_GRACE_MS) {
      return false;
    }
    const live = await this.prisma.refreshToken.count({
      where: {
        familyId: token.familyId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    return live > 0;
  }

  /**
   * Retires every live token in the family and issues its one successor.
   *
   * On a normal rotation the only live token is the one presented. Inside the
   * grace window it is the successor the client never received, which nobody
   * holds and so must not stay valid for a full TTL.
   *
   * One transaction, so a process killed between the two writes cannot leave
   * a family with nothing live in it — which would turn the client's retry
   * into a reuse and log it out.
   */
  private replace(
    existing: RefreshToken,
    userAgent?: string,
  ): Promise<{ userId: string; refreshToken: string }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.updateMany({
        where: { familyId: existing.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const refreshToken = await this.createToken(
        tx,
        existing.userId,
        existing.familyId,
        userAgent,
      );
      return { userId: existing.userId, refreshToken };
    });
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
