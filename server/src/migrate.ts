import { join } from 'path';
import { Client } from 'pg';
import { runMigrations } from './migrations/run-migrations.js';

/**
 * Container entry point for schema migrations, run before `main.js` on every
 * boot in place of `npx prisma migrate deploy` so the image can leave the
 * Prisma CLI out. See `migrations/migration-plan.ts` for why it must stay
 * compatible with the CLI's bookkeeping.
 *
 * Deliberately not a Nest application: it has to finish before anything that
 * would read the schema starts, and needs nothing but a connection string.
 */
async function migrate() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  const client = new Client({ connectionString });
  await client.connect();
  try {
    const applied = await runMigrations(
      client,
      join(process.cwd(), 'prisma', 'migrations'),
      (message) => console.log(message),
    );
    if (applied.length === 0) {
      console.log('No pending migrations');
    }
  } finally {
    await client.end();
  }
}

migrate().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
