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
  timezone: process.env.TZ ?? 'UTC',
});
