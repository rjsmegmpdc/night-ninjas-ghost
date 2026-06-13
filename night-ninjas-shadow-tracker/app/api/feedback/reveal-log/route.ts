import { NextResponse } from 'next/server';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { getLogFilePath } from '@/lib/store/usage-log';
import { logEvent } from '@/lib/store/usage-log';

const execAsync = promisify(exec);

/**
 * POST /api/feedback/reveal-log
 *
 * Opens the OS file manager focused on the usage log file. So the user
 * can drag-and-drop it into a manually-composed feedback email.
 *
 * Platform-specific shell commands:
 *   Windows: explorer /select,"<path>"
 *   macOS:   open -R "<path>"
 *   Linux:   xdg-open "<dir>"   (selects parent dir; no universal "select" command)
 */
export async function POST() {
  const filePath = getLogFilePath();
  const dir = path.dirname(filePath);

  try {
    if (process.platform === 'win32') {
      // /select,"path" needs special escaping; safest is to spawn explorer.exe
      // with the argument quoted. Use exec with quoted path.
      await execAsync(`explorer.exe /select,"${filePath}"`).catch(() => {
        // explorer.exe always exits non-zero with /select even on success — ignore
      });
    } else if (process.platform === 'darwin') {
      await execAsync(`open -R "${filePath}"`);
    } else {
      // Linux: open the containing directory
      await execAsync(`xdg-open "${dir}"`);
    }

    logEvent({ type: 'action', name: 'reveal-log', outcome: 'ok' });
    return NextResponse.json({ ok: true, path: filePath });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    logEvent({ type: 'error', name: 'reveal-log', outcome: 'error', errorTag: 'ExecFailed' });
    return NextResponse.json({ ok: false, error: msg, path: filePath }, { status: 500 });
  }
}
