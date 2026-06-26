/**
 * Compares schema.ts column definitions against the live DB and ALTERs in any missing columns.
 * Reads the schema file as text and extracts column definitions per table.
 * Safe: only ADDs missing columns, never drops or renames.
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const dbPath = path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'NightNinjas', 'shadow-tracker.db');
const db = new Database(dbPath);

// Map SQLite types used in Drizzle schema helpers
const typeMap = {
  text: 'TEXT',
  integer: 'INTEGER',
  real: 'REAL',
  blob: 'BLOB',
};

// Read schema source to find drizzle column definitions
const schemaSource = fs.readFileSync(path.join(process.cwd(), 'lib/db/schema.ts'), 'utf8');

// Extract table definitions: find sqliteTable('table_name', { ... })
const tableRegex = /sqliteTable\(['"`](\w+)['"`]\s*,\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g;

let match;
let totalAdded = 0;

while ((match = tableRegex.exec(schemaSource)) !== null) {
  const tableName = match[1];
  const tableBody = match[2];

  // Get existing columns for this table
  let existingCols;
  try {
    existingCols = db.prepare(`PRAGMA table_info(${tableName})`).all().map(c => c.name);
  } catch {
    console.log(`  Skipping ${tableName} — table not found in DB`);
    continue;
  }

  // Extract column defs: fieldName: type('col_name', ...)
  const colRegex = /\w+\s*:\s*(text|integer|real|blob)\(['"`](\w+)['"`]/g;
  let colMatch;

  while ((colMatch = colRegex.exec(tableBody)) !== null) {
    const sqliteType = typeMap[colMatch[1]] ?? 'TEXT';
    const colName = colMatch[2];

    if (!existingCols.includes(colName)) {
      try {
        db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${colName} ${sqliteType}`);
        console.log(`  + Added ${tableName}.${colName} (${sqliteType})`);
        totalAdded++;
      } catch (e) {
        console.log(`  ! Error adding ${tableName}.${colName}: ${e.message}`);
      }
    }
  }
}

console.log(`\nDone. ${totalAdded} column(s) added.`);
db.close();
