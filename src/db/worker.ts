/**
 * SQLite Web Worker — runs wa-sqlite with IDBBatchAtomicVFS.
 *
 * IDBBatchAtomicVFS uses IndexedDB as persistence; it does NOT require
 * SharedArrayBuffer, COOP, or COEP headers, so it works on GitHub Pages.
 *
 * All DB queries flow through this worker via postMessage so the main
 * thread is never blocked by I/O.
 */
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs';
// @ts-ignore — wa-sqlite examples are plain JS with no type declarations
import { IDBBatchAtomicVFS } from 'wa-sqlite/src/examples/IDBBatchAtomicVFS.js';
import * as SQLite from 'wa-sqlite';

let db: number | null = null;
let sqlite3: SQLiteAPI | null = null;

async function init() {
  const module = await SQLiteESMFactory();
  sqlite3 = SQLite.Factory(module);

  // IDBBatchAtomicVFS is a class — no module param needed
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
  const vfs = new (IDBBatchAtomicVFS as new (name: string) => Parameters<SQLiteAPI['vfs_register']>[0])('ghost-db');
  sqlite3.vfs_register(vfs, true);

  db = await sqlite3.open_v2('ghost.db');

  await exec('PRAGMA journal_mode = WAL');
  await exec('PRAGMA foreign_keys = ON');
  await exec('PRAGMA synchronous = NORMAL');

  await runMigrations();

  self.postMessage({ type: 'ready' });
}

type SQLiteAPI = Awaited<ReturnType<typeof SQLite.Factory>>;
type BindParams = Parameters<SQLiteAPI['bind_collection']>[1];

async function exec(sql: string, params: unknown[] = []): Promise<unknown[][]> {
  if (!sqlite3 || db === null) throw new Error('DB not initialised');
  const rows: unknown[][] = [];
  for await (const stmt of sqlite3.statements(db, sql)) {
    if (params.length) sqlite3.bind_collection(stmt, params as BindParams);
    while (await sqlite3.step(stmt) === SQLite.SQLITE_ROW) {
      rows.push(sqlite3.row(stmt) as unknown[]);
    }
  }
  return rows;
}

async function runMigrations() {
  await exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id    INTEGER PRIMARY KEY,
      name  TEXT NOT NULL UNIQUE,
      ran_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const { MIGRATIONS } = await import('./migrations');
  for (const m of MIGRATIONS) {
    const already = await exec('SELECT id FROM _migrations WHERE name = ?', [m.name]);
    if (already.length === 0) {
      await exec(m.sql);
      await exec('INSERT INTO _migrations (name) VALUES (?)', [m.name]);
    }
  }
}

self.onmessage = async (e: MessageEvent) => {
  const { id, sql, params } = e.data as {
    id: number;
    type: 'exec' | 'query';
    sql: string;
    params?: unknown[];
  };

  try {
    const rows = await exec(sql, params ?? []);
    self.postMessage({ id, rows });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};

init().catch((err) => {
  self.postMessage({ type: 'error', error: String(err) });
});
