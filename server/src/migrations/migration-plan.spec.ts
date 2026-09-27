import { describe, it, expect } from 'vitest';
import {
  migrationChecksum,
  planMigrations,
  type MigrationFile,
  type MigrationRow,
} from './migration-plan.js';

function file(name: string, checksum = `sum-${name}`): MigrationFile {
  return { name, checksum, sql: `-- ${name}` };
}

function applied(name: string, checksum = `sum-${name}`): MigrationRow {
  return {
    migrationName: name,
    checksum,
    finishedAt: new Date('2026-07-01T00:00:00Z'),
    rolledBackAt: null,
  };
}

describe('migrationChecksum', () => {
  it('is the SHA-256 hex of the raw bytes, as Prisma records it', () => {
    // `printf 'SELECT 1;\n' | sha256sum`
    expect(migrationChecksum(Buffer.from('SELECT 1;\n'))).toBe(
      'b4e0497804e46e0a0b0b8c31975b062152d551bac49c3c2e80932567b4085dcd',
    );
  });

  it('distinguishes CRLF from LF, because Prisma does not normalise', () => {
    expect(migrationChecksum(Buffer.from('SELECT 1;\r\n'))).not.toBe(
      migrationChecksum(Buffer.from('SELECT 1;\n')),
    );
  });
});

describe('planMigrations', () => {
  it('runs everything on a fresh database, in name order', () => {
    const plan = planMigrations(
      [file('20260723000000_b'), file('00000000000000_a')],
      [],
    );

    expect(plan.pending.map((m) => m.name)).toEqual([
      '00000000000000_a',
      '20260723000000_b',
    ]);
    expect(plan.failed).toEqual([]);
    expect(plan.modified).toEqual([]);
  });

  it('skips migrations that already finished', () => {
    const plan = planMigrations(
      [file('00000000000000_a'), file('20260723000000_b')],
      [applied('00000000000000_a')],
    );

    expect(plan.pending.map((m) => m.name)).toEqual(['20260723000000_b']);
  });

  it('reports a started-but-unfinished migration as failed', () => {
    const plan = planMigrations(
      [file('00000000000000_a')],
      [{ ...applied('00000000000000_a'), finishedAt: null }],
    );

    expect(plan.failed).toEqual(['00000000000000_a']);
  });

  it('treats a rolled-back migration as pending again', () => {
    const plan = planMigrations(
      [file('00000000000000_a')],
      [
        {
          ...applied('00000000000000_a'),
          finishedAt: null,
          rolledBackAt: new Date('2026-07-02T00:00:00Z'),
        },
      ],
    );

    expect(plan.failed).toEqual([]);
    expect(plan.pending.map((m) => m.name)).toEqual(['00000000000000_a']);
  });

  it('flags an applied migration whose file has changed, without re-running it', () => {
    const plan = planMigrations(
      [file('00000000000000_a', 'new')],
      [applied('00000000000000_a', 'old')],
    );

    expect(plan.pending).toEqual([]);
    expect(plan.modified).toEqual([
      {
        name: '00000000000000_a',
        appliedChecksum: 'old',
        fileChecksum: 'new',
      },
    ]);
  });

  it('ignores rows for migrations missing from disk, as migrate deploy does', () => {
    const plan = planMigrations(
      [],
      [applied('20990101000000_from_the_future')],
    );

    expect(plan).toEqual({ failed: [], modified: [], pending: [] });
  });
});
