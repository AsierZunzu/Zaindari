import type { OidcConfig } from '@prisma/client';

/** The raw `oidc.*` strings from `configuration.ts`, before any judgement. */
export interface OidcEnv {
  name?: string;
  issuerUrl?: string;
  clientId?: string;
  clientSecret?: string;
}

/**
 * Stands in for the `OidcConfig` row when the provider comes from the
 * environment, so everything downstream reads one shape. The fixed timestamp
 * keeps `OidcService`'s discovery cache stable: env can only change with a
 * restart, which clears the cache anyway.
 */
export const ENV_OIDC_CONFIG_ID = 'env';

const DEFAULT_PROVIDER_NAME = 'SSO';

function present(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Resolves the environment's OIDC provider, or null when none is configured.
 *
 * The issuer, client ID and secret come as a set. Setting only some of them is
 * a deployment mistake, and it throws rather than falling back to the admin
 * panel: a half-set environment that quietly does nothing looks exactly like a
 * working one until somebody tries to sign in. `main.ts` calls this at boot so
 * the mistake stops the server, the same way an unknown `TZ` does.
 */
export function resolveEnvOidcConfig(env: OidcEnv): OidcConfig | null {
  const issuerUrl = present(env.issuerUrl);
  const clientId = present(env.clientId);
  const clientSecret = present(env.clientSecret);

  const required = {
    ZAINDARI_OIDC_ISSUER_URL: issuerUrl,
    ZAINDARI_OIDC_CLIENT_ID: clientId,
    ZAINDARI_OIDC_CLIENT_SECRET: clientSecret,
  };
  const missing = Object.entries(required)
    .filter(([, value]) => value === undefined)
    .map(([name]) => name);

  if (missing.length === Object.keys(required).length) return null;
  if (missing.length > 0) {
    throw new Error(
      `OIDC is partly configured in the environment: ${missing.join(', ')} ` +
        `${missing.length === 1 ? 'is' : 'are'} missing. Set all of ` +
        `${Object.keys(required).join(', ')}, or none of them to manage the ` +
        'provider from the admin panel.',
    );
  }

  let issuer: URL;
  try {
    issuer = new URL(issuerUrl!);
  } catch {
    throw new Error(
      `ZAINDARI_OIDC_ISSUER_URL is "${issuerUrl}", which is not a URL.`,
    );
  }
  if (issuer.protocol !== 'https:' && issuer.protocol !== 'http:') {
    throw new Error(
      `ZAINDARI_OIDC_ISSUER_URL must be an http(s) URL, not "${issuerUrl}".`,
    );
  }

  const epoch = new Date(0);
  return {
    id: ENV_OIDC_CONFIG_ID,
    name: present(env.name) ?? DEFAULT_PROVIDER_NAME,
    issuerUrl: issuerUrl!,
    clientId: clientId!,
    clientSecret: clientSecret!,
    enabled: true,
    createdAt: epoch,
    updatedAt: epoch,
  };
}
