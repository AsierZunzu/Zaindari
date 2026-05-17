export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  database: {
    url: process.env.DATABASE_URL,
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? 'change-me-in-production',
    expiration: process.env.JWT_EXPIRATION ?? '15m',
    refreshExpiration: process.env.JWT_REFRESH_EXPIRATION ?? '7d',
  },
  signup: {
    enabled: (process.env.ZAINDARI_SIGNUP_ENABLED ?? 'true') === 'true',
  },
  timezone: process.env.TZ ?? 'UTC',
});
