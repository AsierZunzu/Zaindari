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
  return readCookie(req, REFRESH_COOKIE_NAME);
}

function readCookie(req: Request, name: string): string | undefined {
  // cookie-parser types `req.cookies` as `any`; naming the shape here keeps the
  // `any` from leaking out through the return type.
  const cookies = req.cookies as Record<string, string> | undefined;
  return cookies?.[name];
}

export const OIDC_FLOW_COOKIE_NAME = 'zaindari_oidc';

/** Covers both /api/auth/oidc (where it is set) and its /callback. */
const OIDC_FLOW_COOKIE_PATH = '/api/auth/oidc';

/** Long enough to type a password at the provider, short enough to go stale. */
const OIDC_FLOW_TTL_MS = 10 * 60 * 1000;

/**
 * The per-attempt secrets the callback has to prove it belongs to: `state`
 * ties the callback to this browser (no login CSRF), `nonce` ties the ID token
 * to this attempt, and the PKCE verifier proves the code was redeemed by
 * whoever asked for it.
 */
export interface OidcFlow {
  state: string;
  nonce: string;
  codeVerifier: string;
}

export function setOidcFlowCookie(
  req: Request,
  res: Response,
  flow: OidcFlow,
  configuredSecure: string,
): void {
  // `lax`, not `strict`: the callback is a top-level navigation coming back
  // from the provider's origin, and a strict cookie would not be sent on it.
  res.cookie(OIDC_FLOW_COOKIE_NAME, JSON.stringify(flow), {
    httpOnly: true,
    secure: isSecureRequest(req, configuredSecure),
    sameSite: 'lax',
    path: OIDC_FLOW_COOKIE_PATH,
    maxAge: OIDC_FLOW_TTL_MS,
  });
}

export function clearOidcFlowCookie(
  req: Request,
  res: Response,
  configuredSecure: string,
): void {
  res.clearCookie(OIDC_FLOW_COOKIE_NAME, {
    httpOnly: true,
    secure: isSecureRequest(req, configuredSecure),
    sameSite: 'lax',
    path: OIDC_FLOW_COOKIE_PATH,
  });
}

/** Returns undefined for a missing or tampered cookie rather than throwing. */
export function readOidcFlowCookie(req: Request): OidcFlow | undefined {
  const raw = readCookie(req, OIDC_FLOW_COOKIE_NAME);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const { state, nonce, codeVerifier } = parsed;
    if (
      typeof state === 'string' &&
      typeof nonce === 'string' &&
      typeof codeVerifier === 'string'
    ) {
      return { state, nonce, codeVerifier };
    }
  } catch {
    // fall through
  }
  return undefined;
}
