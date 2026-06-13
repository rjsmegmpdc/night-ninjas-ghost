import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import type { Retailer } from './retailer-types';

// Re-export so server-side callers can import { Retailer, buildSearchUrl }
// from a single module without thinking about the split.
export type { Retailer } from './retailer-types';
export { buildSearchUrl } from './retailer-types';

/**
 * Retailer CSV loader — server-only. Reads `data/shoe-retailers.csv` once
 * at startup and caches the result. Pure types + URL helpers live in
 * `./retailer-types` so they can be imported from client components
 * without bundling node:fs.
 */

let CACHE: Retailer[] | null = null;

function loadCsv(): Retailer[] {
  if (CACHE) return CACHE;
  const csvPath = path.join(process.cwd(), 'data', 'shoe-retailers.csv');
  if (!fs.existsSync(csvPath)) {
    CACHE = [];
    return CACHE;
  }
  const text = fs.readFileSync(csvPath, 'utf8');
  const lines = text.split('\n').slice(1).filter((l) => l.trim().length > 0);
  const out: Retailer[] = [];
  for (const line of lines) {
    const cols = parseCsvLine(line);
    if (cols.length < 3) continue;
    out.push({
      name: cols[0].trim(),
      urlTemplate: cols[1].trim(),
      region: cols[2].trim(),
    });
  }
  CACHE = out;
  return CACHE;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === ',' && !inQuotes) {
      out.push(current);
      current = '';
    } else current += c;
  }
  out.push(current);
  return out;
}

export function listRetailers(): Retailer[] {
  return loadCsv();
}
