/**
 * Browser-side DB client — thin async bridge to the SQLite worker.
 * Returns typed rows; callers use this instead of importing the worker directly.
 */

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (rows: unknown[][]) => void; reject: (e: Error) => void }>();

export function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent) => {
      const { id, rows, error } = e.data as { id: number; rows?: unknown[][]; error?: string };
      if (id == null) return; // lifecycle messages (ready, error)
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (error) p.reject(new Error(error));
      else p.resolve(rows ?? []);
    };
    worker.onerror = (e: ErrorEvent) => {
      // Worker failed to load or threw an uncaught exception outside init().
      // Re-dispatch as a message so DbContext can surface it.
      worker?.dispatchEvent(new MessageEvent('message', {
        data: { type: 'error', error: `Worker load error: ${e.message} (${e.filename}:${e.lineno})` },
      }));
    };
  }
  return worker;
}

/**
 * Factory reset support: ask the worker to close the database, release its
 * OPFS access handles, and delete the 'ghost-db' directory. Runs in the
 * worker because that's the one context guaranteed to have OPFS whenever
 * the app is persisting at all (main-thread getDirectory is missing in
 * some WebKit builds).
 */
export function resetDbStorage(): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve: () => resolve(), reject });
    getWorker().postMessage({ id, type: 'resetStorage' });
  });
}

/**
 * Factory reset support: kill the SQLite worker so its OPFS sync access
 * handles are released — the 'ghost-db' directory cannot be removed while
 * the AccessHandlePoolVFS holds them. Pending queries are rejected; the
 * caller is expected to hard-reload immediately after the reset.
 */
export function terminateWorker(): void {
  if (!worker) return;
  worker.terminate();
  worker = null;
  for (const p of pending.values()) p.reject(new Error('DB worker terminated (factory reset)'));
  pending.clear();
}

export function query(sql: string, params: unknown[] = []): Promise<unknown[][]> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, sql, params });
  });
}

export function exec(sql: string, params: unknown[] = []): Promise<void> {
  return query(sql, params).then(() => undefined);
}

export function execBatch(stmts: { sql: string; params?: unknown[] }[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve: () => resolve(), reject });
    getWorker().postMessage({ id, type: 'execBatch', stmts });
  });
}

/** Typed helper — returns objects keyed by column name. */
export async function queryRows<T extends Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  // The worker returns rows as arrays; column names must be parsed from the SQL
  // or we use a pragma approach. For now callers receive raw arrays.
  // TODO: Upgrade to a Drizzle WASM driver for typed queries.
  const rows = await query(sql, params);
  return rows as unknown as T[];
}
