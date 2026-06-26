import Database from 'better-sqlite3';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const dbPath = path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'NightNinjas', 'shadow-tracker.db');
const migrationsDir = path.join(process.cwd(), 'lib/db/migrations');

const db = new Database(dbPath);
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
console.log('Existing tables:', tables.join(', '));

// Read all migration SQL files
const migrationFiles = fs.readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort();

console.log('\nMigration files:', migrationFiles.join(', '));

// Check which migrations drizzle thinks are applied
const applied = db.prepare("SELECT id FROM __drizzle_migrations").all().map(r => r.id);
console.log('\nDrizzle journal says applied:', applied.join(', '));

// Run migrations that haven't been applied or whose tables are missing
for (const file of migrationFiles) {
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  try {
    db.exec(sql);
    console.log(`Applied: ${file}`);
  } catch (e) {
    if (e.message.includes('already exists') || e.message.includes('duplicate column')) {
      console.log(`Skipped (already applied): ${file}`);
    } else {
      console.log(`Error on ${file}: ${e.message}`);
    }
  }
}

const tablesAfter = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
console.log('\nTables after sync:', tablesAfter.join(', '));
db.close();
