# One-shot DB repair - runs all SQL migrations idempotently against the
# local DB. Use this when check.ps1 has silently skipped migrations and
# you're staring at a "no such table" error.
#
# Usage:
#   .\repair-db.ps1
#
# Safe to run multiple times. Won't delete data.

$ErrorActionPreference = 'Stop'

Write-Host ""
Write-Host "=== Night Ninjas DB Repair ===" -ForegroundColor Cyan
Write-Host ""

$dbPath = Join-Path $env:APPDATA 'NightNinjas\shadow-tracker.db'
$dbDir = Split-Path $dbPath -Parent
$migrationDir = 'lib\db\migrations'
$migrateScript = 'scripts\run-migrations.js'

if (-not (Test-Path $dbDir)) {
    Write-Host "Creating DB directory $dbDir" -ForegroundColor Yellow
    New-Item -Path $dbDir -ItemType Directory -Force | Out-Null
}

if (-not (Test-Path $migrationDir)) {
    Write-Host "ERROR: Migration dir not found at $migrationDir" -ForegroundColor Red
    Write-Host "Run this script from the project root."
    exit 1
}

if (-not (Test-Path $migrateScript)) {
    Write-Host "ERROR: Migration script not found at $migrateScript" -ForegroundColor Red
    Write-Host "Make sure scripts/run-migrations.js was extracted from the bundle."
    exit 1
}

Write-Host "DB path:        $dbPath"
Write-Host "Migrations dir: $migrationDir"
Write-Host ""

node $migrateScript $dbPath $migrationDir

# Exit codes from run-migrations.js:
#   0 = clean run
#   2 = run completed but had unexpected errors (review output)
#   1 (or other) = something fundamental broke

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Repair complete. Restart your dev server with: npm run dev" -ForegroundColor Green
} elseif ($LASTEXITCODE -eq 2) {
    Write-Host ""
    Write-Host "Repair completed but with unexpected errors. Review output above." -ForegroundColor Yellow
    Write-Host "If tables are still missing, share the [migrations] output for diagnosis." -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "Repair script failed (exit code $LASTEXITCODE). Check output above." -ForegroundColor Red
    exit 1
}
