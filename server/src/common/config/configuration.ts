export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  database: {
    url: process.env.DATABASE_URL,
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? 'change-me-in-production',
    expiration: process.env.JWT_EXPIRATION ?? '15m',
    // Sliding lifetime of the refresh cookie; renewed on every use.
    refreshExpirationDays: parseInt(
      process.env.JWT_REFRESH_EXPIRATION_DAYS ?? '30',
      10,
    ),
  },
  cookies: {
    // 'auto' marks the cookie Secure only when the request arrived over HTTPS,
    // so plain-HTTP LAN deployments still work. Force with 'true'/'false'.
    secure: process.env.ZAINDARI_COOKIE_SECURE ?? 'auto',
  },
  signup: {
    enabled: (process.env.ZAINDARI_SIGNUP_ENABLED ?? 'true') === 'true',
  },
  oidc: {
    // The provider itself. All three of issuer/client ID/secret, or none: when
    // set they override the admin panel's OidcConfig row, which then becomes
    // read-only. Resolved and validated by `auth/oidc-env.ts`.
    name: process.env.ZAINDARI_OIDC_NAME,
    issuerUrl: process.env.ZAINDARI_OIDC_ISSUER_URL,
    clientId: process.env.ZAINDARI_OIDC_CLIENT_ID,
    clientSecret: process.env.ZAINDARI_OIDC_CLIENT_SECRET,
    // A first OIDC sign-in links to the local account with the same email only
    // when the provider marks the address `email_verified`. Set this to trust
    // providers that omit the claim — anyone who can choose their email there
    // can then take over the matching account.
    trustUnverifiedEmail:
      (process.env.ZAINDARI_OIDC_TRUST_UNVERIFIED_EMAIL ?? 'false') === 'true',
  },
  admin: {
    // Bootstrap escape hatch: only an admin can mint another admin, so without
    // this a fresh install has no reachable admin panel. The account claiming
    // this username is granted `isAdmin`. Empty means "nobody" — once a real
    // admin exists, unset it.
    bootstrapUsername: process.env.ZAINDARI_ADMIN_USERNAME ?? '',
  },
  timezone: process.env.TZ ?? 'UTC',
});
