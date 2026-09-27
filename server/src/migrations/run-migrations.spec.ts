import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { migrationChecksum } from './migration-plan.js';
import {
  readMigrationFiles,
  runMigrations,
  type SqlClient,
} from './run-migrations.js';

/**
 * A fake `pg.Client`: records every statement and answers the one SELECT the
 * runner makes from `rows`. `failOn` makes any statement containing that text
 * reject, the way a broken migration would.
 */
function fakeClient(rows: Record<string, unknown>[] = [], failOn?: string) {
  const statements: string[] = [];
  const client: SqlClient = {
    query: vi.fn((text: string) => {
      statements.push(text.trim());
      if (failOn && text.includes(failOn)) {
        return Promise.reject(new Error('syntax error'));
      }
      if (text.startsWith('SELECT migration_name')) {
        return Promise.resolve({ rows });
      }
      return Promise.resolve({ rows: [] });
    }),
  };
  return { client, statements };
}

describe('runMigrations', () => {
  let dir: string;

  function addMigration(name: string, sql: string) {
    mkdirSync(join(dir, name));
    writeFileSync(join(dir, name, 'migration.sql'), sql);
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'migrations-'));
    // Prisma keeps this next to the migration directories; it is not one.
    writeFileSync(
      join(dir, 'migration_lock.toml'),
      'provider = "postgresql"\n',
    );
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads each migration directory, skipping stray files', () => {
    addMigration('00000000000000_init', 'CREATE TABLE a ();\r\n');

    expect(readMigrationFiles(dir)).toEqual([
      {
        name: '00000000000000_init',
        checksum: migrationChecksum(Buffer.from('CREATE TABLE a ();\r\n')),
        sql: 'CREATE TABLE a ();\r\n',
      },
    ]);
  });

  it('applies pending migrations in a transaction each, under the Prisma lock', async () => {
    addMigration('00000000000000_init', 'CREATE TABLE a ();');
    addMigration('20260723000000_next', 'CREATE TABLE b ();');
    const { client, statements } = fakeClient();

    const applied = await runMigrations(client, dir, () => {});

    expect(applied).toEqual(['00000000000000_init', '20260723000000_next']);
    expect(statements[0]).toBe('SELECT pg_advisory_lock($1)');
    expect(statements.at(-1)).toBe('SELECT pg_advisory_unlock($1)');
    expect(
      statements.filter(
        (s) => !s.startsWith('INSERT') && !s.includes('_prisma_migrations'),
      ),
    ).toEqual([
      'SELECT pg_advisory_lock($1)',
      'BEGIN',
      'CREATE TABLE a ();',
      'COMMIT',
      'BEGIN',
      'CREATE TABLE b ();',
      'COMMIT',
      'SELECT pg_advisory_unlock($1)',
    ]);
  });

  it('rolls back a failing migration, stops, and still releases the lock', async () => {
    addMigration('00000000000000_init', 'CREATE TABLE a ();');
    addMigration('20260723000000_broken', 'CREATE TABEL b ();');
    addMigration('20260724000000_after', 'CREATE TABLE c ();');
    const { client, statements } = fakeClient([], 'TABEL');

    await expect(runMigrations(client, dir, () => {})).rejects.toThrow(
      'Migration 20260723000000_broken failed and was rolled back',
    );
    expect(statements).toContain('ROLLBACK');
    expect(statements).not.toContain('CREATE TABLE c ();');
    expect(statements.at(-1)).toBe('SELECT pg_advisory_unlock($1)');
  });

  it('refuses to run anything while an earlier migration is half-applied', async () => {
    addMigration('00000000000000_init', 'CREATE TABLE a ();');
    addMigration('20260723000000_next', 'CREATE TABLE b ();');
    const { client, statements } = fakeClient([
      {
        migration_name: '00000000000000_init',
        checksum: 'x',
        finished_at: null,
        rolled_back_at: null,
      },
    ]);

    await expect(runMigrations(client, dir, () => {})).rejects.toThrow(
      '00000000000000_init started but never finished',
    );
    expect(statements).not.toContain('BEGIN');
    expect(statements.at(-1)).toBe('SELECT pg_advisory_unlock($1)');
  });

  it('warns about an edited migration but still applies the pending ones', async () => {
    addMigration('00000000000000_init', 'CREATE TABLE a ();\r\n');
    addMigration('20260723000000_next', 'CREATE TABLE b ();');
    const { client, statements } = fakeClient([
      {
        migration_name: '00000000000000_init',
        // What the CLI recorded from an LF checkout of the same file.
        checksum: migrationChecksum(Buffer.from('CREATE TABLE a ();\n')),
        finished_at: new Date('2026-07-01T00:00:00Z'),
        rolled_back_at: null,
      },
    ]);
    const log = vi.fn();

    const applied = await runMigrations(client, dir, log);

    expect(applied).toEqual(['20260723000000_next']);
    expect(statements).not.toContain('CREATE TABLE a ();\r\n');
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(
        'Warning: migration 00000000000000_init was modified after it was applied',
      ),
    );
  });
});
