import type { Request, Response } from 'express';

export const REFRESH_COOKIE_NAME = 'zaindari_refresh';

/** The refresh cookie is only ever sent to the endpoints that consume it. */
const COOKIE_PATH = '/api/auth';

/**
 * Self-hosted instances are commonly reached over plain HTTP on a LAN, where a
 * Secure cookie would be silently dropped and login would appear to "not stick".
 * Default to mirroring the request's protocol; `ZAINDARI_COOKIE_SECURE=true`
 * forces it on for setups behind a proxy that terminates TLS without setting
 * x-forwarded-proto.
 */
function isSecureRequest(req: Request, configured: string): boolean {
  if (configured === 'true') return true;
  if (configured === 'false') return false;
  const forwarded = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return (proto ?? req.protocol) === 'https';
}

export function setRefreshCookie(
  req: Request,
  res: Response,
  token: string,
  maxAgeMs: number,
  configuredSecure: string,
): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isSecureRequest(req, configuredSecure),
    sameSite: 'lax',
    path: COOKIE_PATH,
    maxAge: maxAgeMs,
  });
}

export function clearRefreshCookie(
  req: Request,
  res: Response,
  configuredSecure: string,
): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: isSecureRequest(req, configuredSecure),
    sameSite: 'lax',
    path: COOKIE_PATH,
  });
}

export function readRefreshCookie(req: Request): string | undefined {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  return cookies?.[REFRESH_COOKIE_NAME];
}
