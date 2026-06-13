import 'server-only';
import { logEvent } from '@/lib/store/usage-log';

/**
 * Instrumentation helpers — add these to server actions and page renders
 * to capture timing + outcome data in the usage log.
 *
 * Usage in server actions:
 *
 *   export async function createRace(formData: FormData) {
 *     return instrumentAction('createRace', async () => {
 *       // ... real work ...
 *     });
 *   }
 *
 * Usage in pages:
 *
 *   export default async function Page() {
 *     return instrumentPage('/calendar', async () => {
 *       // ... real rendering ...
 *     });
 *   }
 *
 * The wrappers always re-throw — they don't swallow errors. They just log.
 */

/** Wrap a server action with timing + outcome logging. */
export async function instrumentAction<T>(
  actionName: string,
  fn: () => Promise<T>,
  meta?: Record<string, string | number | boolean>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    logEvent({
      type: 'action',
      name: actionName,
      durationMs: Date.now() - start,
      outcome: 'ok',
      meta,
    });
    return result;
  } catch (err) {
    // Tag the error type without leaking message content
    const errorTag = err instanceof Error ? err.name : 'Unknown';
    logEvent({
      type: 'error',
      name: actionName,
      durationMs: Date.now() - start,
      outcome: 'error',
      errorTag,
      meta,
    });
    throw err;
  }
}

/**
 * Log a page view with timing. Lighter than instrumentAction — pages
 * don't typically have a meaningful outcome beyond "rendered".
 *
 * Note: server-component pages can't easily wrap their own body in a
 * timing block without restructuring. For now we just log the view at
 * the start and trust render time isn't worth measuring per page. If
 * we need it later, we can add an explicit instrumentPage wrapper.
 */
export function logPageView(path: string, meta?: Record<string, string | number | boolean>) {
  logEvent({
    type: 'page_view',
    name: path,
    meta,
  });
}
