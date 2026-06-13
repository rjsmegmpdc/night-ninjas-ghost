// Migration runner for Night Ninjas Shadow Tracker.
//
// Idempotent. Safe to run multiple times. Run from the project root:
//   node scripts/run-migrations.js [<dbPath>] [<migrationsDir>]
//
// Defaults: dbPath = %APPDATA%\NightNinjas\shadow-tracker.db
//           migrationsDir = lib/db/migrations
//
// Splits each .sql file into individual statements so that an already-
// applied ALTER TABLE doesn't abort the rest of the file. Tolerates
// "already exists" / "duplicate column" errors. Prints unexpected
// errors loudly so the operator notices.

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
  const migrationsDir = process.argv[3] || path.join('lib', 'db', 'migrations');

  // Ensure parent dir for DB file
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log('[migrations] created DB dir: ' + dbDir);
  }

  if (!fs.existsSync(migrationsDir)) {
    console.error('[migrations] ERROR: migrations dir not found: ' + migrationsDir);
    process.exit(1);
  }

  console.log('[migrations] DB path:       ' + dbPath);
  console.log('[migrations] Migrations:    ' + migrationsDir);

  const db = new Database(dbPath);

  const sqlFiles = fs
    .readdirSync(migrationsDir)
    .filter(function (f) { return f.endsWith('.sql'); })
    .sort();

  console.log('[migrations] Found ' + sqlFiles.length + ' migration file(s): ' + sqlFiles.join(', '));
  console.log('');

  let totalApplied = 0;
  let totalSkipped = 0;
  let unexpectedErrors = [];

  for (let i = 0; i < sqlFiles.length; i++) {
    const f = sqlFiles[i];
    const filePath = path.join(migrationsDir, f);
    const sql = fs.readFileSync(filePath, 'utf8');

    // Strip SQL line-comments BEFORE splitting on `;`. Otherwise a
    // semicolon inside a comment (e.g. `-- start; end inclusive`)
    // becomes a false statement boundary, splitting CREATE TABLE in
    // half. The previous splitter filtered comments after splitting,
    // which is too late — the damage is done.
    const stripped = sql.replace(/--[^\r\n]*/g, '');

    // Split on semicolon-followed-by-newline. Strip blank lines.
    const rawStatements = stripped.split(/;[ \t]*\r?\n/);
    const statements = [];
    for (let j = 0; j < rawStatements.length; j++) {
      const code = rawStatements[j].trim();
      if (code.length > 0) statements.push(code);
    }

    let applied = 0;
    let skipped = 0;
    let firstUnexpected = null;

    for (let k = 0; k < statements.length; k++) {
      const stmt = statements[k];
      try {
        db.exec(stmt + ';');
        applied++;
      } catch (e) {
        const msg = (e && e.message) || '';
        const isIdempotent =
          msg.indexOf('duplicate column') !== -1 ||
          msg.indexOf('already exists') !== -1;
        if (isIdempotent) {
          skipped++;
        } else {
          skipped++;
          if (!firstUnexpected) {
            firstUnexpected = msg.split('\n')[0];
            unexpectedErrors.push(f + ': ' + firstUnexpected);
          }
        }
      }
    }

    totalApplied += applied;
    totalSkipped += skipped;
    let line = '  ' + f + ': ' + applied + ' applied, ' + skipped + ' skipped';
    if (firstUnexpected) line += '  [! ' + firstUnexpected + ']';
    console.log(line);
  }

  console.log('');
  console.log('[migrations] verifying tables...');
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all();
  const tables = rows
    .map(function (r) { return r.name; })
    .filter(function (n) { return !n.startsWith('sqlite_'); });
  console.log('[migrations] tables present: ' + tables.length);
  for (let i = 0; i < tables.length; i++) {
    console.log('  - ' + tables[i]);
  }

  db.close();

  console.log('');
  console.log('[migrations] done. ' + totalApplied + ' total stmts applied, ' + totalSkipped + ' skipped.');

  if (unexpectedErrors.length > 0) {
    console.log('');
    console.log('[migrations] UNEXPECTED ERRORS (review):');
    for (let i = 0; i < unexpectedErrors.length; i++) {
      console.log('  - ' + unexpectedErrors[i]);
    }
    process.exit(2);
  }
}

main();
