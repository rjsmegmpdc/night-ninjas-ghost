import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite-async.mjs';
// @ts-ignore
import { IDBMinimalVFS } from 'wa-sqlite/src/examples/IDBMinimalVFS.js';
import * as SQLite from 'wa-sqlite';
import wasmUrl from 'wa-sqlite/dist/wa-sqlite-async.wasm?url';

let db: number | null = null;
let sqlite3: SQLiteAPI | null = null;

type SQLiteAPI = Awaited<ReturnType<typeof SQLite.Factory>>;
type BindParams = Parameters<SQLiteAPI['bind_collection']>[1];

// Asyncify can only suspend one WASM call stack at a time. Concurrent queries
// (e.g. Promise.all in getStoredTokens) corrupt each other's suspended stack
// and surface as SQLITE_CANTOPEN. Every exec() goes through this serial queue.
let _queue: Promise<void> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const result = _queue.then(fn);
  _queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function _exec(sql: string, params: unknown[]): Promise<unknown[][]> {
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

function exec(sql: string, params: unknown[] = []): Promise<unknown[][]> {
  return enqueue(() => _exec(sql, params));
}

async function init() {
  const module = await SQLiteESMFactory({ locateFile: () => wasmUrl });
  sqlite3 = SQLite.Factory(module);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
  const vfs = new (IDBMinimalVFS as new (name: string) => Parameters<SQLiteAPI['vfs_register']>[0])('ghost-db');
  sqlite3.vfs_register(vfs, true);

  db = await sqlite3.open_v2('ghost.db');

  // Verify handle is usable before reporting ready
  await exec('SELECT 1');
  await exec('PRAGMA foreign_keys = ON');
  await runMigrations();

  self.postMessage({ type: 'ready' });
}

async function runMigrations() {
  await exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id     INTEGER PRIMARY KEY,
      name   TEXT NOT NULL UNIQUE,
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

self.onmessage = (e: MessageEvent) => {
  const { id, sql, params } = e.data as {
    id: number;
    sql: string;
    params?: unknown[];
  };
  void enqueue(async () => {
    try {
      const rows = await _exec(sql, params ?? []);
      self.postMessage({ id, rows });
    } catch (err) {
      self.postMessage({ id, error: String(err) });
    }
  });
};

init().catch((err: unknown) => {
  self.postMessage({ type: 'error', error: `init failed: ${String(err)}` });
});
