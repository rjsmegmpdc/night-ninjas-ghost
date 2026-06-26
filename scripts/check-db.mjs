import Database from 'better-sqlite3';
import path from 'node:path';
import os from 'node:os';

const dbPath = path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'NightNinjas', 'shadow-tracker.db');
console.log('DB path:', dbPath);

const db = new Database(dbPath);
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name).join(', '));

const planPeriods = tables.find(t => t.name === 'plan_periods');
if (planPeriods) {
  const cols = db.prepare("PRAGMA table_info(plan_periods)").all();
  console.log('plan_periods columns:', cols.map(c => c.name).join(', '));
  const hasCol = cols.some(c => c.name === 'weekly_volume_cap_km');
  if (!hasCol) {
    db.exec('ALTER TABLE plan_periods ADD COLUMN weekly_volume_cap_km REAL');
    console.log('Added weekly_volume_cap_km column');
  } else {
    console.log('Column already exists');
  }
} else {
  console.log('plan_periods table not found — DB may need full migration');
}
db.close();
