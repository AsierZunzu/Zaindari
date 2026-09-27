import { randomUUID } from 'crypto';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  migrationChecksum,
  planMigrations,
  type MigrationFile,
  type MigrationRow,
  type ModifiedMigration,
} from './migration-plan.js';

/** The slice of `pg.Client` the runner needs, so specs can hand in a fake. */
export interface SqlClient {
  query(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
}

export type Log = (message: string) => void;

/**
 * The key Prisma's schema engine passes to `pg_advisory_lock` around
 * `migrate deploy`. Taking the same one means two containers booting at once
 * queue behind each other, and so does a CLI run from a checkout against the
 * same database.
 */
const PRISMA_MIGRATE_LOCK = 72707369;

/** Byte-for-byte the table the CLI creates, so either can create it first. */
const CREATE_MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    VARCHAR(36) PRIMARY KEY NOT NULL,
    "checksum"              VARCHAR(64) NOT NULL,
    "finished_at"           TIMESTAMPTZ,
    "migration_name"        VARCHAR(255) NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        TIMESTAMPTZ,
    "started_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count"   INTEGER NOT NULL DEFAULT 0
)`;

export function readMigrationFiles(dir: string): MigrationFile[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(dir, entry.name, 'migration.sql'))
    .filter((path) => existsSync(path))
    .map((path) => {
      const bytes = readFileSync(path);
      return {
        name: path.split(/[\\/]/).at(-2)!,
        checksum: migrationChecksum(bytes),
        sql: bytes.toString('utf8'),
      };
    });
}

/**
 * What to do when a migration that already ran no longer matches its file.
 *
 * `prisma migrate deploy` only warns here. The edited SQL is never run again
 * either way — the question is whether the app should still start.
 */
export function onModifiedMigration(
  migration: ModifiedMigration,
  log: Log,
): void {
  // Warn and carry on, as Prisma does. Refusing to boot would be stricter, but
  // the mismatch that actually happens is line endings: a CRLF checkout and
  // CI's LF one checksum differently, and that must not brick an install.
  log(
    `Warning: migration ${migration.name} was modified after it was applied ` +
      `(applied ${migration.appliedChecksum}, file ${migration.fileChecksum}). ` +
      'The edited SQL will not run; put schema changes in a new migration.',
  );
}

/**
 * Applies every pending migration and returns their names. Throws — so the
 * container exits before the app starts — on a half-applied migration left
 * by an earlier run, or when any migration fails.
 *
 * Each migration runs in its own transaction, so a failure leaves nothing
 * behind: no partial schema and no row to `migrate resolve` away. The cost is
 * that a migration cannot contain a statement Postgres refuses inside a
 * transaction (`CREATE INDEX CONCURRENTLY`, using an enum value added earlier
 * in the same file). Prisma never generates those; a hand-written one would
 * have to be split into two migrations.
 */
export async function runMigrations(
  client: SqlClient,
  dir: string,
  log: Log,
): Promise<string[]> {
  await client.query('SELECT pg_advisory_lock($1)', [PRISMA_MIGRATE_LOCK]);
  try {
    await client.query(CREATE_MIGRATIONS_TABLE);

    const { rows } = await client.query(
      'SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"',
    );
    const plan = planMigrations(
      readMigrationFiles(dir),
      rows.map((row): MigrationRow => ({
        migrationName: row.migration_name as string,
        checksum: row.checksum as string,
        finishedAt: row.finished_at as Date | null,
        rolledBackAt: row.rolled_back_at as Date | null,
      })),
    );

    if (plan.failed.length > 0) {
      throw new Error(
        `Migration(s) ${plan.failed.join(', ')} started but never finished. ` +
          'Fix the database by hand, then run `npx prisma migrate resolve` ' +
          'from a checkout to mark them applied or rolled back.',
      );
    }

    for (const migration of plan.modified) {
      onModifiedMigration(migration, log);
    }

    for (const migration of plan.pending) {
      const startedAt = new Date();
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(
          `INSERT INTO "_prisma_migrations"
             (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
           VALUES ($1, $2, now(), $3, $4, 1)`,
          [randomUUID(), migration.checksum, migration.name, startedAt],
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(
          `Migration ${migration.name} failed and was rolled back`,
          {
            cause: err,
          },
        );
      }
      log(`Applied migration ${migration.name}`);
    }

    return plan.pending.map((migration) => migration.name);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [PRISMA_MIGRATE_LOCK]);
  }
}
