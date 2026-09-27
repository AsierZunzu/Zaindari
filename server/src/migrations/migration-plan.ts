import { createHash } from 'crypto';

/**
 * Deciding which migrations to apply, kept apart from the database so the
 * rules can be tested without one.
 *
 * The runner exists so the production image does not have to ship the Prisma
 * CLI (~250 MB of Studio, a bundled TypeScript and the schema engine) just to
 * run `migrate deploy` at boot. It is only worth doing if it is
 * indistinguishable from the CLI to anything that reads `_prisma_migrations`:
 * an instance migrated by an older image, or by `npx prisma migrate deploy`
 * from a checkout, must carry on with this one and vice versa. Every rule
 * below mirrors what Prisma does rather than what might be tidier.
 */

export interface MigrationFile {
  /** The directory name under `prisma/migrations`, e.g. `20260723000000_add_refresh_tokens`. */
  name: string;
  checksum: string;
  sql: string;
}

/** One row of `_prisma_migrations`, camelCased. */
export interface MigrationRow {
  migrationName: string;
  checksum: string;
  finishedAt: Date | null;
  rolledBackAt: Date | null;
}

export interface ModifiedMigration {
  name: string;
  appliedChecksum: string;
  fileChecksum: string;
}

export interface MigrationPlan {
  /** Names of migrations that started and never finished. Nothing is safe to run while any exist. */
  failed: string[];
  /** Already applied, but the file on disk has changed since. */
  modified: ModifiedMigration[];
  /** Not yet applied, in the order they must run. */
  pending: MigrationFile[];
}

/**
 * Prisma's checksum is a SHA-256 of the file's raw bytes — no line-ending
 * normalisation — so it must be computed from the Buffer, not from a decoded
 * string. A CRLF checkout and an LF one therefore disagree, exactly as they do
 * for the CLI.
 */
export function migrationChecksum(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function planMigrations(
  files: MigrationFile[],
  rows: MigrationRow[],
): MigrationPlan {
  // A rolled-back row no longer counts: `prisma migrate resolve --rolled-back`
  // is how an operator says "run this one again", so the migration is pending.
  const live = rows.filter((row) => row.rolledBackAt === null);

  const failed = live
    .filter((row) => row.finishedAt === null)
    .map((row) => row.migrationName);

  const applied = new Map(
    live
      .filter((row) => row.finishedAt !== null)
      .map((row) => [row.migrationName, row.checksum]),
  );

  const modified: ModifiedMigration[] = [];
  const pending: MigrationFile[] = [];

  // Directory names start with a timestamp, so name order is apply order —
  // the same ordering Prisma uses.
  const ordered = [...files].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );

  for (const file of ordered) {
    const appliedChecksum = applied.get(file.name);
    if (appliedChecksum === undefined) {
      pending.push(file);
    } else if (appliedChecksum !== file.checksum) {
      modified.push({
        name: file.name,
        appliedChecksum,
        fileChecksum: file.checksum,
      });
    }
  }

  // Rows with no file on disk are ignored, as `migrate deploy` ignores them:
  // an image older than the database is a rollback somebody chose.
  return { failed, modified, pending };
}
