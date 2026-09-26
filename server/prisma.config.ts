// Prisma 7 no longer reads .env on its own, and no longer accepts the
// connection URL in schema.prisma. Loading dotenv here keeps
// `npx prisma migrate dev` working locally against server/.env; in the
// container DATABASE_URL comes from the environment and this is a no-op.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Not prisma/config's env(): that throws when the variable is unset, and
    // CI runs `prisma generate` with no database at all. Commands that do
    // need a connection (migrate) still fail clearly without it.
    url: process.env.DATABASE_URL,
  },
});
