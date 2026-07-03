// AccessHandlePoolVFS uses OPFS SyncAccessHandle — all I/O is synchronous,
// so this uses the regular (non-Asyncify) WASM build. No concurrency issues,
// no SharedArrayBuffer, no COOP/COEP headers. Persistent across reloads.
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs';
// @ts-ignore
import { AccessHandlePoolVFS } from 'wa-sqlite/src/examples/AccessHandlePoolVFS.js';
import * as SQLite from 'wa-sqlite';
import wasmUrl from 'wa-sqlite/dist/wa-sqlite.wasm?url';

let db: number | null = null;
let sqlite3: SQLiteAPI | null = null;

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

async function init() {
  const module = await SQLiteESMFactory({ locateFile: () => wasmUrl });
  sqlite3 = SQLite.Factory(module);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
  const vfs = new (AccessHandlePoolVFS as new (dir: string) => { isReady: Promise<void> } & Parameters<SQLiteAPI['vfs_register']>[0])('ghost-db');
  await vfs.isReady;
  sqlite3.vfs_register(vfs, true);

  db = await sqlite3.open_v2('ghost.db');
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

self.onmessage = async (e: MessageEvent) => {
  const { id, sql, params } = e.data as {
    id: number;
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

init().catch((err: unknown) => {
  self.postMessage({ type: 'error', error: `init failed: ${String(err)}` });
});
