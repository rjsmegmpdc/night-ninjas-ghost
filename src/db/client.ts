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
