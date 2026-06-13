import 'server-only';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Shoe database lookup.
 *
 * Reads `data/shoes-database.csv` once at startup and matches a Strava
 * gear name against brand+model entries. Returns the matched entry or
 * null if nothing fits.
 *
 * The CSV is bundled with the app (read-only). User overrides are
 * applied at the database row level via `user_target_km`, not by editing
 * the CSV.
 *
 * Matching is best-effort string matching:
 *   1. Try exact "Brand Model" against gear name
 *   2. Try case-insensitive contains
 *   3. Try matching brand and as much of the model as possible
 *   4. Default 800 km if no match
 */

export interface ShoeMatch {
  brand: string;
  model: string;
  recommendedKm: number;
  category: 'race-day' | 'super-trainer' | 'uptempo' | 'daily' | 'trail';
  carbonPlate: boolean;
  notes?: string;
}

let CACHE: ShoeMatch[] | null = null;

function loadDatabase(): ShoeMatch[] {
  if (CACHE) return CACHE;

  // Resolve to project root + data/shoes-database.csv
  // process.cwd() is the project root when next runs
  const csvPath = path.join(process.cwd(), 'data', 'shoes-database.csv');
  if (!fs.existsSync(csvPath)) {
    // Defensive: if CSV missing, return empty array (everything defaults to 800 km)
    CACHE = [];
    return CACHE;
  }

  const text = fs.readFileSync(csvPath, 'utf8');
  const lines = text.split('\n').slice(1).filter((l) => l.trim().length > 0);
  const out: ShoeMatch[] = [];

  for (const line of lines) {
    const cols = parseCsvLine(line);
    if (cols.length < 5) continue;
    const [brand, model, recommendedKmStr, category, carbonPlateStr, ...rest] = cols;
    const recommendedKm = parseFloat(recommendedKmStr);
    if (!isFinite(recommendedKm)) continue;

    out.push({
      brand: brand.trim(),
      model: model.trim(),
      recommendedKm,
      category: (category.trim() as ShoeMatch['category']) ?? 'daily',
      carbonPlate: carbonPlateStr.trim() === '1',
      notes: rest.join(',').trim() || undefined,
    });
  }

  CACHE = out;
  return CACHE;
}

/** Simple CSV parser handling quoted fields. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      out.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  out.push(current);
  return out;
}

/**
 * Match a Strava gear name against the shoe database.
 *
 * Examples that work:
 *   "Saucony Endorphin Pro 3"      → exact match
 *   "endorphin pro 3"              → contains-match
 *   "My Sauconys (Pro 3)"          → brand + model contains
 *   "Random Shoe Name 2024"        → no match (returns null)
 */
export function matchShoeName(gearName: string): ShoeMatch | null {
  const db = loadDatabase();
  if (db.length === 0) return null;

  const needle = gearName.toLowerCase().trim();

  // Pass 1: exact "Brand Model" match
  for (const entry of db) {
    const fullName = `${entry.brand} ${entry.model}`.toLowerCase();
    if (fullName === needle) return entry;
  }

  // Pass 2: needle contains "Brand Model" (e.g. "My Saucony Endorphin Pro 3 (red)")
  for (const entry of db) {
    const fullName = `${entry.brand} ${entry.model}`.toLowerCase();
    if (needle.includes(fullName)) return entry;
  }

  // Pass 3: model substring match (handles "endorphin pro 3" without brand)
  // Sort by model length desc so we prefer the longest/most-specific match
  const sortedByModelLen = [...db].sort((a, b) => b.model.length - a.model.length);
  for (const entry of sortedByModelLen) {
    if (needle.includes(entry.model.toLowerCase())) return entry;
  }

  // Pass 4: brand-only — won't pick a model but at least we know the brand
  // Only use this as a last resort and don't return a definite recommendedKm
  for (const entry of db) {
    if (needle.includes(entry.brand.toLowerCase())) {
      // Return a partial match using the most generic shoe of that brand?
      // Actually no — better to return null and let the default kick in.
      return null;
    }
  }

  return null;
}

/** For UI: list distinct brand names known to the database. */
export function listBrands(): string[] {
  const db = loadDatabase();
  return Array.from(new Set(db.map((s) => s.brand))).sort();
}

/** For testing / UI: return the entire DB. */
export function listAllShoes(): ShoeMatch[] {
  return loadDatabase();
}
