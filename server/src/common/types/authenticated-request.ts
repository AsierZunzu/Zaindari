import type { Request } from 'express';
import type { User } from '@prisma/client';

/**
 * The shape `JwtAuthGuard` leaves on the request.
 *
 * `JwtStrategy.validate()` currently returns whatever `UsersService.findById()`
 * hands back — the full Prisma `User` row, `passwordHash` and all. Guards,
 * decorators and controllers all read it through `request.user`.
 *
 * TODO(you): decide what this alias should be. See the note in the chat — the
 * choice is between mirroring the runtime value exactly and narrowing it so the
 * hash is unreachable from request handlers.
 */
export type AuthUser = User;

/**
 * An express request that has passed `JwtAuthGuard`.
 *
 * `context.switchToHttp().getRequest()` is typed `any`, so every guard that
 * reached for `request.user` was silently unchecked. Passing this type as the
 * generic argument — `getRequest<AuthenticatedRequest>()` — is what restores it.
 */
export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}
