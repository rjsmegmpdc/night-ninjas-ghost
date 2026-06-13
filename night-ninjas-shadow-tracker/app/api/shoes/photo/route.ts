import { NextResponse, type NextRequest } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { resolveDataDir } from '@/lib/db/data-dir';

/**
 * GET /api/shoes/photo?file=<filename>
 *
 * Serves shoe photos stored in <dataDir>/shoe-photos/.
 * The browser can't access the data dir directly, so we proxy via this
 * route. Filenames are validated against a strict pattern to prevent
 * directory traversal.
 */

const FILENAME_PATTERN = /^shoe-\d+-\d+\.(jpg|jpeg|png|webp)$/;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filename = searchParams.get('file');

  if (!filename || !FILENAME_PATTERN.test(filename)) {
    return new NextResponse('Invalid filename', { status: 400 });
  }

  const filePath = path.join(resolveDataDir(), 'shoe-photos', filename);

  if (!fs.existsSync(filePath)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);
  const ext = filename.split('.').pop()?.toLowerCase();
  const contentType =
    ext === 'png' ? 'image/png' :
    ext === 'webp' ? 'image/webp' :
    'image/jpeg';

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=86400',
    },
  });
}
