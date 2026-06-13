// Lists tables in the local SQLite DB. Used by check.ps1 to verify
// migrations have produced the expected schema.
//
//   node scripts/list-tables.js [<dbPath>]
//
// Outputs CSV of table names on stdout. Exits 0 on success, 1 on error.

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const os = require('os');

function defaultDbPath() {
  const appdata = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appdata, 'NightNinjas', 'shadow-tracker.db');
}

function main() {
  const dbPath = process.argv[2] || defaultDbPath();

  if (!fs.existsSync(dbPath)) {
    console.error('DB not found: ' + dbPath);
    process.exit(1);
  }

  try {
    const db = new Database(dbPath, { readonly: true });
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all();
    const tables = rows
      .map(function (r) { return r.name; })
      .filter(function (n) { return !n.startsWith('sqlite_'); });
    console.log(tables.join(','));
    db.close();
    process.exit(0);
  } catch (e) {
    console.error('INTROSPECT_FAILED: ' + (e && e.message));
    process.exit(1);
  }
}

main();
