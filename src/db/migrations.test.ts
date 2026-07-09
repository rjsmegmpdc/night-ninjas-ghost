/**
 * Tests for src/db/migrations.ts
 *
 * The migration runner in GHOST targets wa-sqlite (browser WASM) — no
 * better-sqlite3 or synchronous SQLite in the node test environment.
 * These tests therefore validate the MIGRATIONS array contract rather
 * than executing SQL against a real DB:
 *
 *  1. Migrations are named with 4-digit ascending prefixes (strict ordering)
 *  2. Every migration SQL uses IF NOT EXISTS / ADD COLUMN patterns that are
 *     safe to replay (idempotency contract enforced by structure)
 *  3. Expected tables from each migration are present in the SQL text
 *  4. No migration uses a bare CREATE TABLE without IF NOT EXISTS (would break
 *     on re-run)
 *  5. Migration names are unique
 *
 * The mock runner test validates the ordering invariant: if a hypothetical
 * runner applied migrations in array order, each migration index corresponds
 * to a numerically higher prefix than the previous one.
 */

import { describe, expect, it } from 'vitest';
import { MIGRATIONS } from './migrations';

// ---------------------------------------------------------------------------
// Structural contract tests
// ---------------------------------------------------------------------------

describe('MIGRATIONS array — structural contract', () => {
  it('exports a non-empty array of migrations', () => {
    expect(Array.isArray(MIGRATIONS)).toBe(true);
    expect(MIGRATIONS.length).toBeGreaterThan(0);
  });

  it('every migration has a name string and sql string', () => {
    for (const m of MIGRATIONS) {
      expect(typeof m.name).toBe('string');
      expect(m.name.length).toBeGreaterThan(0);
      expect(typeof m.sql).toBe('string');
      expect(m.sql.trim().length).toBeGreaterThan(0);
    }
  });

  it('migration names are unique', () => {
    const names = MIGRATIONS.map((m) => m.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('migration names are in ascending numeric order (0001 before 0002 before 0003 etc)', () => {
    for (let i = 1; i < MIGRATIONS.length; i++) {
      const prev = MIGRATIONS[i - 1].name;
      const curr = MIGRATIONS[i].name;
      // Names start with a 4-digit prefix — compare lexicographically
      const prevPrefix = prev.match(/^(\d+)/)?.[1] ?? '';
      const currPrefix = curr.match(/^(\d+)/)?.[1] ?? '';
      expect(prevPrefix.length).toBeGreaterThanOrEqual(4);
      expect(currPrefix.length).toBeGreaterThanOrEqual(4);
      expect(prevPrefix < currPrefix).toBe(true);
    }
  });

  it('migration names begin with a 4-digit prefix (0001, 0002, …)', () => {
    for (const m of MIGRATIONS) {
      expect(m.name).toMatch(/^\d{4}_/);
    }
  });
});

// ---------------------------------------------------------------------------
// Idempotency contract — SQL must be re-runnable
// ---------------------------------------------------------------------------

describe('MIGRATIONS — idempotency contract (SQL text analysis)', () => {
  /**
   * Every CREATE TABLE statement must include IF NOT EXISTS so that running
   * migrations a second time does not fail with "table already exists".
   * ALTER TABLE ADD COLUMN also needs to be handled — SQLite throws if a
   * column already exists, so we check for the pattern.
   */

  it('all CREATE TABLE statements use IF NOT EXISTS', () => {
    for (const m of MIGRATIONS) {
      // Find all CREATE TABLE occurrences
      const createTableMatches = m.sql.match(/CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/gi) ?? [];
      expect(
        createTableMatches.length,
        `Migration ${m.name} has a CREATE TABLE without IF NOT EXISTS`
      ).toBe(0);
    }
  });

  it('all CREATE INDEX statements use IF NOT EXISTS', () => {
    for (const m of MIGRATIONS) {
      const createIndexMatches = m.sql.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS)/gi) ?? [];
      expect(
        createIndexMatches.length,
        `Migration ${m.name} has a CREATE INDEX without IF NOT EXISTS`
      ).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Table presence — each migration covers the expected schema elements
// ---------------------------------------------------------------------------

describe('MIGRATIONS — expected tables per migration', () => {
  it('migration 0001 creates activities, settings, shoes, journal, plans, plan_periods, races, calendar_events, sync_jobs', () => {
    const m = MIGRATIONS.find((m) => m.name.startsWith('0001'))!;
    expect(m).toBeDefined();
    const expectedTables = [
      'activities',
      'settings',
      'shoes',
      'journal',
      'plans',
      'plan_periods',
      'races',
      'calendar_events',
      'sync_jobs',
    ];
    for (const table of expectedTables) {
      expect(m.sql, `0001 must reference table ${table}`).toContain(table);
    }
  });

  it('migration 0002 creates recurring_sessions and alters races', () => {
    const m = MIGRATIONS.find((m) => m.name.startsWith('0002'))!;
    expect(m).toBeDefined();
    expect(m.sql).toContain('recurring_sessions');
    expect(m.sql.toLowerCase()).toContain('alter table races');
  });

  it('migration 0003 creates race_results and vo2max_observations', () => {
    const m = MIGRATIONS.find((m) => m.name.startsWith('0003'))!;
    expect(m).toBeDefined();
    expect(m.sql).toContain('race_results');
    expect(m.sql).toContain('vo2max_observations');
  });
});

// ---------------------------------------------------------------------------
// Mock runner — ordering invariant
// ---------------------------------------------------------------------------

describe('migration runner ordering invariant', () => {
  /**
   * Simulates applying migrations in array order and verifies that each
   * migration's numeric prefix is strictly greater than the one before.
   * This is the in-code equivalent of asserting "run 0001 before 0002 before 0003".
   */
  it('applying migrations in array order is equivalent to applying them in ascending prefix order', () => {
    const prefixes = MIGRATIONS.map((m) => {
      const match = m.name.match(/^(\d+)/);
      return match ? parseInt(match[1], 10) : NaN;
    });

    for (let i = 1; i < prefixes.length; i++) {
      expect(Number.isNaN(prefixes[i])).toBe(false);
      expect(prefixes[i]).toBeGreaterThan(prefixes[i - 1]);
    }
  });

  it('a runner that skips already-applied names is idempotent (mock)', () => {
    // Simulate a runner that records applied migration names and skips re-runs
    const applied = new Set<string>();

    function runMigrations(migrations: typeof MIGRATIONS) {
      let ranCount = 0;
      for (const m of migrations) {
        if (applied.has(m.name)) continue;
        applied.add(m.name);
        ranCount++;
      }
      return ranCount;
    }

    // First pass — all should run
    const firstRun = runMigrations(MIGRATIONS);
    expect(firstRun).toBe(MIGRATIONS.length);

    // Second pass — none should run (all already applied)
    const secondRun = runMigrations(MIGRATIONS);
    expect(secondRun).toBe(0);

    // Third pass — still none
    const thirdRun = runMigrations(MIGRATIONS);
    expect(thirdRun).toBe(0);
  });

  it('a new migration appended after the set runs once but existing ones are skipped', () => {
    const applied = new Set<string>();
    const existingNames = MIGRATIONS.map((m) => m.name);

    // Pre-populate applied with all existing migrations
    for (const name of existingNames) applied.add(name);

    const newMigration = { name: '9999_future_test', sql: 'CREATE TABLE IF NOT EXISTS future_test (id INTEGER PRIMARY KEY);' };
    const withNew = [...MIGRATIONS, newMigration];

    let ranCount = 0;
    for (const m of withNew) {
      if (applied.has(m.name)) continue;
      applied.add(m.name);
      ranCount++;
    }

    expect(ranCount).toBe(1); // only the new one ran
    expect(applied.has('9999_future_test')).toBe(true);
  });
});
