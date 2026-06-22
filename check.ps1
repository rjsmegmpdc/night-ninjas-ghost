<#
.SYNOPSIS
    Night Ninjas - Shadow Tracker - environment & integrity checker

.DESCRIPTION
    Run this any time the dev server misbehaves, after pulling a new zip,
    or before starting fresh. Idempotent - safe to run repeatedly.

      1. Kills orphan node/next processes for this project
      2. Strips UTF-8 BOMs from all .ts/.tsx files (Next.js Turbopack chokes on them)
      3. Verifies project structure
      4. Verifies dependencies
      5. Verifies SQLite DB schema (and applies pending migrations)
      6. Reports status

.NOTES
    Run from anywhere. Auto-locates itself via $PSCommandPath.
    First time: Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
#>

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSCommandPath
Set-Location $ProjectRoot

function Write-Step    { param($m) Write-Host "`n>> $m" -ForegroundColor Cyan }
function Write-Ok      { param($m) Write-Host "  OK  $m" -ForegroundColor Green }
function Write-Warn    { param($m) Write-Host "  !!  $m" -ForegroundColor Yellow }
function Write-Fail    { param($m) Write-Host "  XX  $m" -ForegroundColor Red }
function Write-Action  { param($m) Write-Host "  ->  $m" -ForegroundColor Magenta }

Write-Host ""
Write-Host "================================================================" -ForegroundColor DarkGray
Write-Host "  NIGHT NINJAS - SHADOW TRACKER - CHECKER" -ForegroundColor White
Write-Host "  $ProjectRoot" -ForegroundColor DarkGray

# Display bundle version up front so it's the first thing visible.
# Helps identify which bundle is running before the checker even starts.
if (Test-Path 'bundle-version.json') {
    try {
        $bv = Get-Content 'bundle-version.json' -Raw | ConvertFrom-Json
        $builtAt = [datetime]$bv.builtAt
        $builtAtDisplay = $builtAt.ToString('yyyy-MM-dd HH:mm') + 'Z'
        Write-Host "  bundle: $builtAtDisplay - $($bv.hash) - $($bv.fileCount) files" -ForegroundColor DarkGray
    } catch {
        Write-Host "  bundle: (could not parse bundle-version.json)" -ForegroundColor Yellow
    }
} else {
    Write-Host "  bundle: (bundle-version.json missing - dev environment?)" -ForegroundColor Yellow
}

Write-Host "================================================================" -ForegroundColor DarkGray

# ---------------------------------------------------------------------------
# Step 1 - kill orphan dev servers
# ---------------------------------------------------------------------------

Write-Step "Killing orphan dev servers"

$killedAny = $false

foreach ($port in @(3000, 3001)) {
    $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
             Where-Object { $_.State -eq 'Listen' }
    foreach ($c in $conns) {
        try {
            $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Action "Killing PID $($proc.Id) ($($proc.ProcessName)) on port $port"
                Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
                $killedAny = $true
            }
        } catch { }
    }
}

$projectName = Split-Path $ProjectRoot -Leaf
try {
    $projectNodes = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
                    Where-Object { $_.CommandLine -and $_.CommandLine -like "*$projectName*" }
    foreach ($p in $projectNodes) {
        Write-Action "Killing node.exe PID $($p.ProcessId) (project ref)"
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
        $killedAny = $true
    }
} catch { }

if (-not $killedAny) { Write-Ok "No orphan processes found" }
Start-Sleep -Milliseconds 500

# ---------------------------------------------------------------------------
# Step 2 - strip UTF-8 BOMs from all .ts/.tsx files
# Next 16 Turbopack reports BOM-prefixed files as "Unterminated string constant"
# at random line numbers. We strip them preemptively here.
# ---------------------------------------------------------------------------

Write-Step "Stripping UTF-8 BOMs from TypeScript files"

$stripped = 0
$tsFiles = Get-ChildItem -Path . -Recurse -File -Include "*.ts","*.tsx" |
           Where-Object { $_.FullName -notmatch '\\node_modules\\' -and $_.FullName -notmatch '\\.next\\' }

foreach ($f in $tsFiles) {
    try {
        $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
        if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
            $stripped++
            $newBytes = New-Object byte[] ($bytes.Length - 3)
            [System.Array]::Copy($bytes, 3, $newBytes, 0, $newBytes.Length)
            [System.IO.File]::WriteAllBytes($f.FullName, $newBytes)
            $rel = $f.FullName.Substring($ProjectRoot.Length + 1)
            Write-Action "Stripped: $rel"
        }
    } catch {
        Write-Warn "Could not read $($f.FullName): $_"
    }
}

if ($stripped -eq 0) {
    Write-Ok "No BOM-prefixed files found ($($tsFiles.Count) checked)"
} else {
    Write-Ok "Stripped BOMs from $stripped of $($tsFiles.Count) files"
}

# ---------------------------------------------------------------------------
# Step 2b - ENSURE PowerShell .ps1 files HAVE a UTF-8 BOM
# Inverse of step 2: Windows PowerShell 5.1 reads non-BOM files as
# Windows-1252 and mangles any multi-byte UTF-8 characters (em-dashes,
# middle dots, etc.) producing parse errors at unrelated line numbers.
# Adding a BOM forces correct UTF-8 interpretation regardless of host.
# ---------------------------------------------------------------------------

Write-Step "Ensuring UTF-8 BOM on PowerShell scripts"

$bomAdded = 0
$psFiles = Get-ChildItem -Path . -File -Filter "*.ps1"

foreach ($f in $psFiles) {
    try {
        $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
        $hasBom = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
        if (-not $hasBom) {
            $bomAdded++
            $bom = [byte[]](0xEF, 0xBB, 0xBF)
            $newBytes = New-Object byte[] ($bytes.Length + 3)
            [System.Array]::Copy($bom, 0, $newBytes, 0, 3)
            [System.Array]::Copy($bytes, 0, $newBytes, 3, $bytes.Length)
            [System.IO.File]::WriteAllBytes($f.FullName, $newBytes)
            Write-Action "Added BOM: $($f.Name)"
        }
    } catch {
        Write-Warn "Could not check $($f.Name): $_"
    }
}

if ($bomAdded -eq 0) {
    Write-Ok "All $($psFiles.Count) PowerShell scripts have UTF-8 BOM"
} else {
    Write-Ok "Added BOM to $bomAdded of $($psFiles.Count) PowerShell scripts"
}

# ---------------------------------------------------------------------------
# Step 3 - verify required files exist
# ---------------------------------------------------------------------------

Write-Step "Verifying project structure"

$requiredFiles = @(
    # Top-level config
    'package.json',
    'tsconfig.json',
    'next.config.mjs',
    'postcss.config.mjs',
    'tailwind.config.ts',
    'drizzle.config.ts',
    'vitest.config.ts',
    'extract-bundle.ps1',
    'fix-test-script.ps1',
    'recover-node-modules.ps1',
    'verify-bundle-sync.ps1',
    'cleanup-stray-home-files.ps1',
    'kill-port.ps1',
    'github-setup.ps1',
    'bundle-manifest.json',
    'bundle-version.json',
    '.npmrc',

    # Build/repair scripts
    'scripts\list-tables.js',
    'scripts\run-migrations.js',

    # Bundled data
    'data\shoe-retailers.csv',
    'data\shoes-database.csv',

    # App routes & layouts - main app shell
    'app\layout.tsx',
    'app\page.tsx',
    'app\globals.css',

    # App routes & layouts - main app surface
    'app\(app)\layout.tsx',
    'app\(app)\calendar\page.tsx',
    'app\(app)\coach-log\page.tsx',
    'app\(app)\dojo\page.tsx',
    'app\(app)\help\page.tsx',
    'app\(app)\journal\page.tsx',
    'app\(app)\patrol\page.tsx',
    'app\(app)\profile\page.tsx',
    'app\(app)\race\page.tsx',
    'app\(app)\recon\page.tsx',
    'app\(app)\settings\page.tsx',
    'app\(app)\shoes\page.tsx',
    'app\(app)\strike\page.tsx',

    # API routes
    'app\api\feedback\log-summary\route.ts',
    'app\api\feedback\reveal-log\route.ts',
    'app\api\setup\status\route.ts',
    'app\api\shoes\photo\route.ts',
    'app\api\strava\auth\route.ts',
    'app\api\strava\callback\route.ts',
    'app\api\strava\sync\route.ts',
    'app\api\strava\sync\status\route.ts',

    # Setup wizard
    'app\setup\layout.tsx',
    'app\setup\page.tsx',
    'app\setup\connect\page.tsx',
    'app\setup\dojo\page.tsx',
    'app\setup\goal\page.tsx',
    'app\setup\races\page.tsx',
    'app\setup\strava-app\page.tsx',
    'app\setup\sync\page.tsx',
    'app\setup\volume\page.tsx',
    'app\setup\weekly\page.tsx',

    # Library - actions (server actions)
    'lib\actions\calendar-events.ts',
    'lib\actions\capacity.ts',
    'lib\actions\dojo.ts',
    'lib\actions\backfill-plan-period.ts',
    'lib\actions\first-day-of-week.ts',
    'lib\actions\generate-club-share.ts',
    'lib\actions\plan-adjustments.ts',
    'lib\actions\coach-mode.ts',
    'lib\actions\vo2max.ts',
    'lib\actions\interruptions.ts',
    'lib\actions\plan-start-date.ts',
    'lib\actions\race-debrief.ts',
    'lib\actions\wellness.ts',
    'lib\actions\sunday-reflection.ts',
    'lib\actions\block-debrief.ts',
    'lib\actions\profile.ts',
    'lib\actions\garmin.ts',
    'lib\actions\switch-dojo.ts',
    'lib\actions\races.ts',
    'lib\actions\recurring-sessions.ts',
    'lib\actions\refresh-holidays.ts',
    'lib\actions\settings-admin.ts',
    'lib\actions\shoes.ts',
    'lib\actions\sync.ts',
    'lib\actions\streak-settings.ts',

    # Library - analysis
    'lib\bundle-version.ts',
    'lib\analysis\athlete-state-pure.ts',
    'lib\analysis\athlete-state.ts',
    'lib\analysis\biometrics.ts',
    'lib\analysis\biometrics-pure.ts',
    'lib\analysis\biometrics.test.ts',
    'lib\analysis\trends.ts',
    'lib\analysis\trends-pure.ts',
    'lib\analysis\trends-pure.test.ts',
    'lib\analysis\vo2max.ts',
    'lib\analysis\vo2max-pure.ts',
    'lib\analysis\vo2max-pure.test.ts',
    'lib\analysis\vo2max-insights.ts',
    'lib\analysis\vo2max-insights.test.ts',
    'lib\analysis\ns-guardrails.ts',
    'lib\analysis\ns-guardrails.test.ts',
    'lib\analysis\ns-guardrails-read.ts',
    'lib\coach\coach-voice-pure.ts',
    'lib\coach\coach-voice-pure.test.ts',
    'lib\analysis\hr-availability.ts',
    'lib\analysis\interruptions-pure.ts',
    'lib\analysis\interruptions-pure.test.ts',
    'lib\analysis\monotony-pure.ts',
    'lib\analysis\monotony-pure.test.ts',
    'lib\analysis\injury-vulnerability-pure.ts',
    'lib\analysis\injury-vulnerability-pure.test.ts',
    'lib\analysis\session-match-pure.ts',
    'lib\analysis\session-match-pure.test.ts',
    'lib\analysis\interruptions.ts',
    'lib\analysis\athlete-state.test.ts',
    'lib\analysis\best-week.ts',
    'lib\analysis\compliance.ts',
    'lib\analysis\intensity-distribution.ts',
    'lib\analysis\load.ts',
    'lib\analysis\load.test.ts',
    'lib\analysis\observations.ts',
    'lib\analysis\progression.ts',
    'lib\analysis\recent-weeks.ts',
    'lib\analysis\sport-classifier.ts',
    'lib\analysis\streak.ts',
    'lib\analysis\week-queries.ts',
    'lib\analysis\weekly-history.ts',

    # Library - constants & data
    'lib\constants\settings-keys.ts',
    'lib\data\nz-holidays.ts',
    'lib\dates\iso.ts',

    # Library - race (Phase 6)
    'lib\race\execution-pure.ts',
    'lib\race\execution-pure.test.ts',
    'lib\race\execution.ts',
    'lib\race\taper-pure.ts',
    'lib\race\taper-pure.test.ts',
    'lib\race\post-race-pure.ts',
    'lib\race\post-race-pure.test.ts',
    'lib\race\macrocycle-pure.ts',
    'lib\race\macrocycle-pure.test.ts',
    'lib\race\macrocycle.ts',
    'lib\race\debrief-pure.ts',
    'lib\race\debrief-pure.test.ts',

    # Library - weather (Phase 7)
    'lib\weather\heat-adjust-pure.ts',
    'lib\weather\heat-adjust-pure.test.ts',
    'lib\weather\forecast.ts',

    # Library - DB
    'lib\db\data-dir.ts',
    'lib\db\index.ts',
    'lib\db\schema.ts',
    'lib\db\migrations\0001_calendar.sql',
    'lib\db\migrations\0002_nz_holidays.sql',
    'lib\db\migrations\0003_sync_jobs.sql',
    'lib\db\migrations\0004_shoes.sql',
    'lib\db\migrations\0005_plan_periods.sql',
    'lib\db\migrations\0006_plan_adjustments.sql',
    'lib\db\migrations\0007_daily_health_metrics.sql',
    'lib\db\migrations\0008_vo2max_observations.sql',
    'lib\db\migrations\0009_interruptions.sql',
    'lib\db\migrations\0010_race_results.sql',
    'lib\db\migrations\0011_coach_voice.sql',

    # Library - plans (8 dojos + framework)
    'lib\plans\active-plan.ts',
    'lib\plans\calendar-blocks.ts',
    'lib\plans\custom.ts',
    'lib\plans\daniels.ts',
    'lib\plans\derive.ts',
    'lib\plans\hansons.ts',
    'lib\plans\higdon.ts',
    'lib\plans\index.ts',
    'lib\plans\lydiard.ts',
    'lib\plans\pfitzinger.ts',
    'lib\plans\plan-periods.ts',
    'lib\plans\base-maintenance.ts',
    'lib\plans\recovery-prescription-pure.ts',
    'lib\plans\recovery-prescription-pure.test.ts',
    'lib\plans\distribute-events.ts',
    'lib\plans\program-phase.ts',
    'lib\plans\dojo-card-meta.ts',
    'lib\plans\dow-display.ts',
    'lib\club-share\types.ts',
    'lib\club-share\generator.ts',
    'lib\club-share\generator.test.ts',
    'lib\plans\engine-snapshot.test.ts',
    'lib\plans\norwegian-singles.ts',
    'lib\plans\state-awareness.ts',
    'lib\plans\state-awareness.test.ts',
    'lib\plans\state-aware-week.ts',
    'lib\plans\matrix-adjustments.ts',
    'lib\plans\matrix-adjustments-pure.ts',
    'lib\plans\matrix-adjustments-pure.test.ts',
    'lib\plans\adjustment-history.ts',
    'lib\plans\__snapshots__\engine-snapshot.test.ts.snap',
    'lib\garmin\types.ts',
    'lib\garmin\mapper.ts',
    'lib\garmin\mapper.test.ts',
    'lib\garmin\mfa-auth.ts',
    'lib\garmin\client.ts',
    'lib\garmin\sync.ts',
    'lib\plans\ramp.ts',
    'lib\plans\ramp-loader.ts',
    'lib\plans\polarised.ts',
    'lib\plans\types.ts',
    'lib\plans\ultra.ts',
    'lib\plans\week-context.ts',

    # Library - shoes
    'lib\shoes\backfill.ts',
    'lib\shoes\database.ts',
    'lib\shoes\ingest.ts',
    'lib\shoes\queries.ts',
    'lib\shoes\retailers.ts',
    'lib\shoes\retailer-types.ts',

    # Library - external sources
    'lib\sources\nz-holidays.ts',
    'lib\sources\strava.ts',
    'lib\sources\strava-api.ts',
    'lib\sources\strava-mapper.ts',
    'lib\sources\sync-runner.ts',

    # Library - local store
    'lib\store\instrument.ts',
    'lib\store\secrets.ts',
    'lib\store\settings.ts',
    'lib\store\usage-log.ts',
    'lib\utils.ts',

    # Components - brand
    'components\brand\logo.tsx',
    'components\brand\wordmark.tsx',
    'components\brand\bundle-version-chip.tsx',

    # Components - calendar surface
    'components\calendar\add-personal-day-form.tsx',
    'components\calendar\capacity-section.tsx',
    'components\calendar\commitment-section.tsx',
    'components\calendar\goal-race-editor.tsx',
    'components\calendar\group-run-section.tsx',
    'components\calendar\ninja-loop-section.tsx',
    'components\calendar\race-section.tsx',
    'components\calendar\tune-up-row.tsx',

    # Components - feedback / nav / patrol / settings
    'components\feedback\feedback-button.tsx',
    'components\nav\topnav.tsx',
    'components\nav\avatar-menu.tsx',
    'components\patrol\race-countdown.tsx',
    'components\patrol\program-matrix-expand.tsx',
    'components\patrol\program-matrix.tsx',
    'components\patrol\matrix-cells.tsx',
    'components\patrol\matrix-filter-shell.tsx',
    'components\patrol\matrix-legend.tsx',
    'components\patrol\matrix-load-action.ts',
    'components\patrol\streak-counter.tsx',
    'components\patrol\sync-button.tsx',
    'components\patrol\week-compliance-chip.tsx',
    'components\patrol\freshness-chip.tsx',
    'components\patrol\intensity-chip.tsx',
    'components\patrol\progression-flag-card.tsx',
    'components\patrol\ramp-card.tsx',
    'components\patrol\week-adherence-chip.tsx',
    'components\strike\athlete-state-card.tsx',
    'components\strike\intensity-history-card.tsx',
    'components\strike\mileage-trajectory-card.tsx',
    'components\strike\biometrics-card.tsx',
    'components\recon\trends-cards.tsx',
    'components\vo2max\vo2-capture.tsx',
    'components\vo2max\vo2-trend-card.tsx',
    'components\vo2max\vo2-profile-form.tsx',
    'components\vo2max\vo2-insights-card.tsx',
    'components\vo2max\ns-calibration-card.tsx',
    'components\profile\strength-prefs-form.tsx',
    'components\profile\wellness-slider-form.tsx',
    'components\profile\injury-ledger.tsx',
    'components\dojo\backfill-plan-period-button.tsx',
    'components\dojo\dojo-card.tsx',
    'components\dojo\ns-hr-readiness.tsx',
    'components\dojo\dojo-picker.tsx',
    'components\dojo\level-toggle.tsx',
    'components\dojo\program-shape-card.tsx',
    'components\dojo\start-date-editor.tsx',
    'components\settings\destructive-forms.tsx',
    'components\settings\export-data-button.tsx',
    'components\settings\gear-backfill-button.tsx',
    'components\settings\sync-jobs-table.tsx',
    'components\settings\streak-mode-toggle.tsx',
    'components\settings\first-day-of-week-toggle.tsx',
    'components\club-share\terms-modal.tsx',
    'components\club-share\club-share-section.tsx',
    'components\settings\coach-mode-toggle.tsx',
    'components\patrol\coach-adjustment-card.tsx',
    'components\patrol\proposal-history.tsx',
    'components\patrol\ns-guardrails-card.tsx',
    'components\patrol\interruption-indicator.tsx',
    'components\patrol\coach-voice-card.tsx',
    'components\patrol\sunday-reflection-card.tsx',
    'components\patrol\block-debrief-card.tsx',
    'components\garmin\garmin-section.tsx',

    # Components - journal (Phase 4 + Phase 9)
    'components\journal\interruption-log-form.tsx',
    'components\journal\active-interruption-banner.tsx',
    'components\journal\return-to-training-card.tsx',
    'components\journal\injury-risk-card.tsx',
    'components\journal\reflection-log.tsx',

    # Components - race (Phase 6)
    'components\race\pace-plan-card.tsx',
    'components\race\fueling-card.tsx',
    'components\race\carb-load-card.tsx',
    'components\race\forecast-card.tsx',
    'components\race\taper-card.tsx',
    'components\race\post-race-card.tsx',
    'components\race\race-debrief-form.tsx',
    'components\race\macrocycle-card.tsx',

    # Components - shoes
    'components\shoes\add-manual-shoe-form.tsx',
    'components\shoes\shoe-card.tsx',
    'components\shoes\shoe-card-forms.tsx',
    'components\shoes\shoe-nudge.tsx',
    'components\shoes\shoe-nudge-banner.tsx',
    'components\shoes\shoe-quick-add.tsx',
    'components\shoes\shoe-row.tsx',
    'components\shoes\shoe-table.tsx',

    # Components - sync
    'components\sync\sync-progress.tsx',
    'components\sync\sync-status-banner.tsx',

    # Components - theme
    'components\theme\theme-provider.tsx',
    'components\theme\theme-toggle.tsx',

    # Components - UI primitives
    'components\ui\button.tsx',
    'components\ui\card.tsx',
    'components\ui\empty-state.tsx',
    'components\ui\field-help.tsx',
    'components\ui\hover-card.tsx',
    'components\ui\input.tsx',
    'components\ui\page-stub.tsx',
    'components\ui\stat.tsx',
    'components\ui\stepper.tsx'
)

$missing = @()
foreach ($f in $requiredFiles) {
    if (-not (Test-Path $f)) { $missing += $f }
}

if ($missing.Count -eq 0) {
    Write-Ok "All $($requiredFiles.Count) required files present"
} else {
    Write-Fail "$($missing.Count) required file(s) missing:"
    foreach ($m in $missing) { Write-Host "      - $m" -ForegroundColor Red }
    Write-Host ""
    Write-Host "  Re-extract the latest zip over this folder, then re-run check.ps1" -ForegroundColor Yellow
    exit 1
}

# ---------------------------------------------------------------------------
# Step 3b - verify package.json + key config files are not stale
# ---------------------------------------------------------------------------
#
# This catches the failure mode where extraction "succeeded" but didn't
# overwrite a top-level file that already existed locally. The most common
# casualty is package.json - if scripts are missing, npm commands fail
# with confusing errors.
#
# We verify expected scripts and devDeps are present in package.json. If
# anything is missing, fail loudly with a copy-paste fix.
# ---------------------------------------------------------------------------

Write-Step "Verifying package.json + config integrity"

$pkgJsonRaw = Get-Content 'package.json' -Raw
$pkg = $pkgJsonRaw | ConvertFrom-Json

# Expected scripts that must exist for the current bundle to function
$expectedScripts = @('dev', 'build', 'start', 'lint', 'db:generate', 'db:migrate', 'db:studio', 'test', 'test:watch')
$missingScripts = @()
foreach ($s in $expectedScripts) {
    if (-not $pkg.scripts.PSObject.Properties.Name -contains $s) {
        $missingScripts += $s
    }
}

if ($missingScripts.Count -gt 0) {
    Write-Fail "package.json is missing $($missingScripts.Count) expected script(s):"
    foreach ($s in $missingScripts) { Write-Host "      - $s" -ForegroundColor Red }
    Write-Host ""
    Write-Host "  This usually means extraction didn't overwrite package.json." -ForegroundColor Yellow
    Write-Host "  Fix: delete package.json and re-extract the bundle, OR run:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "    Remove-Item package.json -Force" -ForegroundColor Cyan
    Write-Host "    # then re-extract the bundle zip over this folder" -ForegroundColor DarkGray
    Write-Host ""
    exit 1
}
Write-Ok "package.json scripts present"

# Expected devDeps that must exist
$expectedDevDeps = @('vitest', 'typescript', 'tailwindcss', 'drizzle-kit')
$missingDevDeps = @()
foreach ($d in $expectedDevDeps) {
    if (-not $pkg.devDependencies.PSObject.Properties.Name -contains $d) {
        $missingDevDeps += $d
    }
}

if ($missingDevDeps.Count -gt 0) {
    Write-Fail "package.json is missing $($missingDevDeps.Count) expected devDependency(ies):"
    foreach ($d in $missingDevDeps) { Write-Host "      - $d" -ForegroundColor Red }
    Write-Host ""
    Write-Host "  Fix: delete package.json and re-extract, OR run npm install for missing pkgs" -ForegroundColor Yellow
    exit 1
}
Write-Ok "package.json devDependencies present"

# Verify vitest config has the postcss bypass - without it, tests fail with
# a confusing "Cannot find module 'tailwindcss'" error from PostCSS
$vitestConfig = Get-Content 'vitest.config.ts' -Raw
if ($vitestConfig -notmatch 'postcss\s*:\s*\{') {
    Write-Fail "vitest.config.ts is missing the PostCSS bypass"
    Write-Host "  Without it, 'npm run test' will fail trying to load tailwind." -ForegroundColor Yellow
    Write-Host "  Fix: re-extract vitest.config.ts from the bundle." -ForegroundColor Yellow
    exit 1
}
Write-Ok "vitest.config.ts shape valid"

# ---------------------------------------------------------------------------
# Step 4 - verify dependencies
# ---------------------------------------------------------------------------

Write-Step "Verifying dependencies"

if (-not (Test-Path 'node_modules\next\package.json')) {
    Write-Fail "node_modules missing or incomplete"
    Write-Action "Run: npm install"
    exit 1
} else {
    $nextVer = (Get-Content 'node_modules\next\package.json' -Raw | ConvertFrom-Json).version
    Write-Ok "next@$nextVer"
}

foreach ($mod in @('better-sqlite3', 'keytar', 'drizzle-orm', 'react')) {
    if (Test-Path "node_modules\$mod\package.json") {
        $v = (Get-Content "node_modules\$mod\package.json" -Raw | ConvertFrom-Json).version
        Write-Ok "$mod@$v"
    } else {
        Write-Fail "$mod missing - run: npm install"
        exit 1
    }
}

if (-not (Test-Path 'node_modules\better-sqlite3\build\Release\better_sqlite3.node')) {
    Write-Fail "better-sqlite3 native binding missing"
    Write-Host ""
    Write-Host "  This is the cause of 'Module not found: better-sqlite3' errors in Next.js." -ForegroundColor Yellow
    Write-Host "  Recovery (try in order):" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "    1. npm rebuild better-sqlite3" -ForegroundColor Cyan
    Write-Host "       (re-fetches prebuilt binary for your Node version)" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "    2. If step 1 fails:" -ForegroundColor Cyan
    Write-Host "         Remove-Item -Recurse -Force node_modules" -ForegroundColor Cyan
    Write-Host "         Remove-Item -Force package-lock.json" -ForegroundColor Cyan
    Write-Host "         npm cache clean --force" -ForegroundColor Cyan
    Write-Host "         npm install" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "    3. If step 2 fails (native compile path):" -ForegroundColor Cyan
    Write-Host "         Install Visual Studio Build Tools 2022 with C++ workload" -ForegroundColor DarkGray
    Write-Host "         Then retry step 2." -ForegroundColor DarkGray
    Write-Host ""
    exit 1
}
Write-Ok "better-sqlite3 native binding present"

if (-not (Test-Path 'node_modules\keytar\build\Release\keytar.node')) {
    Write-Fail "keytar native binding missing"
    Write-Host ""
    Write-Host "  This will cause Strava OAuth credential storage to fail." -ForegroundColor Yellow
    Write-Host "  Recovery:" -ForegroundColor Yellow
    Write-Host "    npm rebuild keytar" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}
Write-Ok "keytar native binding present"

# ---------------------------------------------------------------------------
# Step 5 - verify local SQLite DB and apply pending migrations
# ---------------------------------------------------------------------------

Write-Step "Verifying database"

$dbPath = Join-Path $env:APPDATA 'NightNinjas\shadow-tracker.db'
$dbDir = Split-Path $dbPath -Parent

if (-not (Test-Path $dbDir)) {
    Write-Action "Creating DB directory $dbDir"
    New-Item -Path $dbDir -ItemType Directory -Force | Out-Null
}

$expected = @(
    'activities', 'activity_shoe_assignments', 'calendar_events', 'journal',
    'nz_holidays', 'plans', 'races', 'recurring_sessions', 'settings',
    'shoes', 'shoe_price_watches', 'sync_jobs', 'sync_log'
)

# Always run migrations idempotently. The Node script lives in
# scripts/run-migrations.js so PowerShell doesn't have to handle JS
# escape sequences inside a here-string (which has caused parser
# failures historically).
$migrateScript = 'scripts\run-migrations.js'
$listTablesScript = 'scripts\list-tables.js'

if (Test-Path $migrateScript) {
    Write-Action "Applying SQL migrations (idempotent)"
    node $migrateScript $dbPath
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 2) {
        Write-Warn "Migration runner exited with code $LASTEXITCODE"
    }
} else {
    Write-Warn "Migration script not found at $migrateScript"
}

# Verify
if (Test-Path $dbPath) {
    $dbSizeKb = [math]::Round((Get-Item $dbPath).Length / 1024, 1)
    Write-Ok ("DB exists: $dbPath ({0} KB)" -f $dbSizeKb)

    if (Test-Path $listTablesScript) {
        $tablesCsv = node $listTablesScript $dbPath
        if ($LASTEXITCODE -eq 0 -and $tablesCsv) {
            $tables = $tablesCsv -split ','
            $missingTables = $expected | Where-Object { $tables -notcontains $_ }
            if ($missingTables.Count -eq 0) {
                Write-Ok "All $($expected.Count) expected tables present"
            } else {
                Write-Warn "STILL MISSING after migration run: $($missingTables -join ', ')"
                Write-Warn "Check that migration files exist for these tables in lib\db\migrations"
            }
        } else {
            Write-Warn "Could not list tables - output: $tablesCsv"
        }
    }
} else {
    Write-Warn "DB still doesn't exist after migration step"
}

# ---------------------------------------------------------------------------
# Step 6 - final status
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "================================================================" -ForegroundColor DarkGray
Write-Host "  READY TO RUN" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor White
Write-Host "    npm run dev" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Then open:" -ForegroundColor White
Write-Host "    http://localhost:3000/calendar" -ForegroundColor Cyan
Write-Host ""
