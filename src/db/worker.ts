import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs';
// @ts-ignore
import { AccessHandlePoolVFS } from 'wa-sqlite/src/examples/AccessHandlePoolVFS.js';
// @ts-ignore
import { MemoryVFS } from 'wa-sqlite/src/examples/MemoryVFS.js';
import * as SQLite from 'wa-sqlite';
import wasmUrl from 'wa-sqlite/dist/wa-sqlite.wasm?url';

let db: number | null = null;
let sqlite3: SQLiteAPI | null = null;
// Retained for factory reset — the VFS instance owns the OPFS access
// handles, which must be released before the directory can be removed.
let activeVfs: { close?: () => Promise<void> | void } | null = null;

type SQLiteAPI = Awaited<ReturnType<typeof SQLite.Factory>>;
type BindParams = Parameters<SQLiteAPI['bind_collection']>[1];

type OPFSVfs = { isReady: Promise<void>; getCapacity(): number } & Parameters<SQLiteAPI['vfs_register']>[0];

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

async function buildVFS(): Promise<{ vfs: Parameters<SQLiteAPI['vfs_register']>[0]; label: string }> {
  // Try OPFS first (persistent across reloads). Falls back to MemoryVFS if
  // OPFS is unavailable (older Safari, private browsing, blocked storage).
  try {
    // @ts-ignore
    const vfs = new (AccessHandlePoolVFS as new (dir: string) => OPFSVfs)('ghost-db');
    await vfs.isReady;
    const cap = vfs.getCapacity();
    if (cap === 0) throw new Error(`OPFS isReady resolved but capacity=0`);
    return { vfs, label: `OPFS(capacity=${cap})` };
  } catch (opfsErr) {
    self.postMessage({ type: 'warn', message: `OPFS unavailable (${String(opfsErr)}), using MemoryVFS — data will not persist` });
    // @ts-ignore
    const vfs = new (MemoryVFS as new () => Parameters<SQLiteAPI['vfs_register']>[0])();
    return { vfs, label: 'MemoryVFS' };
  }
}

async function init() {
  const module = await SQLiteESMFactory({ locateFile: () => wasmUrl });
  sqlite3 = SQLite.Factory(module);

  const { vfs, label } = await buildVFS();
  activeVfs = vfs as typeof activeVfs;
  sqlite3.vfs_register(vfs, true);

  db = await sqlite3.open_v2('ghost.db');
  await exec('SELECT 1');
  await exec('PRAGMA foreign_keys = ON');
  await runMigrations();

  self.postMessage({ type: 'ready', storage: label });
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
  const msg = e.data as {
    id: number;
    type?: string;
    sql?: string;
    params?: unknown[];
    stmts?: { sql: string; params?: unknown[] }[];
  };
  const { id } = msg;

  // Factory reset: close the database, release the VFS's OPFS access
  // handles, then delete the whole OPFS directory. Runs HERE (not on the
  // main thread) because the worker both holds the handles and is the one
  // context guaranteed to have OPFS when the app is using it at all.
  if (msg.type === 'resetStorage') {
    try {
      if (sqlite3 && db !== null) {
        try { await sqlite3.close(db); } catch { /* best-effort */ }
        db = null;
      }
      try { await activeVfs?.close?.(); } catch { /* release is best-effort */ }
      activeVfs = null;
      const root = await navigator.storage.getDirectory();
      await root.removeEntry('ghost-db', { recursive: true });
      self.postMessage({ id, rows: [] });
    } catch (err) {
      self.postMessage({ id, error: String(err) });
    }
    return;
  }

  if (msg.type === 'execBatch') {
    try {
      await exec('BEGIN');
      try {
        for (const stmt of msg.stmts ?? []) {
          await exec(stmt.sql, stmt.params ?? []);
        }
        await exec('COMMIT');
      } catch (innerErr) {
        await exec('ROLLBACK').catch(() => undefined);
        throw innerErr;
      }
      self.postMessage({ id, rows: [] });
    } catch (err) {
      self.postMessage({ id, error: String(err) });
    }
    return;
  }

  // Default: single query
  try {
    const rows = await exec(msg.sql ?? '', msg.params ?? []);
    self.postMessage({ id, rows });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};

init().catch((err: unknown) => {
  self.postMessage({ type: 'error', error: `init failed: ${String(err)}` });
});
