<#
.SYNOPSIS
    Recover from a broken / partially-nuked node_modules state.

.DESCRIPTION
    Use this when:
      - `Remove-Item -Recurse -Force node_modules` failed with "Access denied"
        because next-swc.win32-x64-msvc.node or another file was locked
      - `npm install` is failing with ERESOLVE peer-dep errors
      - You're stuck with a half-installed node_modules and `next` not in PATH

    What it does:
      1. Stops lingering node.exe processes (dev servers, vitest watchers)
      2. Force-deletes node_modules using cmd's `rd /s /q` (handles locks
         better than PowerShell's Remove-Item)
      3. Removes package-lock.json
      4. Runs `npm install` - picks up .npmrc which sets legacy-peer-deps
      5. Verifies critical packages (next, better-sqlite3, keytar) installed

.NOTES
    If step 2 still fails, you'll need to close any IDE/editor that has
    the project open (VS Code's TypeScript service can hold .node files
    open). Restart the script after closing it.

    First time: Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
#>

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSCommandPath
Set-Location $ProjectRoot

function Write-Step { param($m) Write-Host "`n>> $m" -ForegroundColor Cyan }
function Write-Ok   { param($m) Write-Host "  OK  $m" -ForegroundColor Green }
function Write-Fail { param($m) Write-Host "  XX  $m" -ForegroundColor Red }
function Write-Warn { param($m) Write-Host "  !!  $m" -ForegroundColor Yellow }

Write-Host ""
Write-Host "================================================================" -ForegroundColor DarkGray
Write-Host "  NODE_MODULES RECOVERY" -ForegroundColor White
Write-Host "  $ProjectRoot" -ForegroundColor DarkGray
Write-Host "================================================================" -ForegroundColor DarkGray

# ---------------------------------------------------------------------------
# Step 1 - kill lingering node processes
# ---------------------------------------------------------------------------

Write-Step "Stopping lingering node.exe processes"

$nodes = Get-Process node -ErrorAction SilentlyContinue
if ($nodes) {
    foreach ($n in $nodes) {
        try {
            Stop-Process -Id $n.Id -Force -ErrorAction Stop
            Write-Ok "Stopped node.exe pid=$($n.Id)"
        } catch {
            Write-Warn "Could not stop pid=$($n.Id) : $_"
        }
    }
} else {
    Write-Ok "No lingering node.exe processes found"
}

# ---------------------------------------------------------------------------
# Step 2 - force-delete node_modules using cmd
# ---------------------------------------------------------------------------

Write-Step "Removing node_modules"

if (Test-Path 'node_modules') {
    # cmd's `rd /s /q` handles some lock scenarios better than PowerShell's
    # Remove-Item. If a file is genuinely locked by an editor, this still
    # fails, but it's worth trying first.
    $proc = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c rd /s /q node_modules' -Wait -PassThru -NoNewWindow
    if ($proc.ExitCode -eq 0 -and -not (Test-Path 'node_modules')) {
        Write-Ok "node_modules removed"
    } else {
        Write-Fail "Could not fully remove node_modules"
        Write-Host ""
        Write-Host "  Likely cause: an editor (VS Code, JetBrains, etc.) has files in" -ForegroundColor Yellow
        Write-Host "  node_modules open via its TypeScript service or extensions." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  Recovery:" -ForegroundColor Yellow
        Write-Host "    1. Close VS Code / your editor completely (not just the window)" -ForegroundColor Cyan
        Write-Host "    2. Re-run this script" -ForegroundColor Cyan
        Write-Host ""
        exit 1
    }
} else {
    Write-Ok "node_modules already absent"
}

# ---------------------------------------------------------------------------
# Step 3 - remove package-lock for a clean resolve
# ---------------------------------------------------------------------------

Write-Step "Removing package-lock.json (forces clean resolve)"

if (Test-Path 'package-lock.json') {
    Remove-Item 'package-lock.json' -Force
    Write-Ok "package-lock.json removed"
} else {
    Write-Ok "package-lock.json already absent"
}

# ---------------------------------------------------------------------------
# Step 4 - npm cache clean
# ---------------------------------------------------------------------------

Write-Step "Cleaning npm cache"
& npm cache clean --force 2>&1 | Out-Null
Write-Ok "npm cache cleaned"

# ---------------------------------------------------------------------------
# Step 5 - verify .npmrc has legacy-peer-deps
# ---------------------------------------------------------------------------

Write-Step "Checking .npmrc"

if (-not (Test-Path '.npmrc')) {
    Write-Fail ".npmrc missing - npm install will fail with ERESOLVE"
    Write-Host ""
    Write-Host "  Re-extract the latest bundle to get .npmrc, then re-run." -ForegroundColor Yellow
    exit 1
}

$npmrc = Get-Content '.npmrc' -Raw
if ($npmrc -match 'legacy-peer-deps\s*=\s*true') {
    Write-Ok ".npmrc has legacy-peer-deps=true"
} else {
    Write-Warn ".npmrc exists but doesn't set legacy-peer-deps - adding it"
    Add-Content '.npmrc' "`nlegacy-peer-deps=true"
    Write-Ok "Appended legacy-peer-deps=true to .npmrc"
}

# ---------------------------------------------------------------------------
# Step 6 - npm install
# ---------------------------------------------------------------------------

Write-Step "Running npm install (this takes ~1-3 minutes)"

& npm install
if ($LASTEXITCODE -ne 0) {
    Write-Fail "npm install failed"
    Write-Host ""
    Write-Host "  See the npm error output above. Common causes:" -ForegroundColor Yellow
    Write-Host "    - Network issue (try again)" -ForegroundColor DarkGray
    Write-Host "    - Native build chain missing (install Visual Studio Build Tools)" -ForegroundColor DarkGray
    Write-Host "    - Antivirus interfering (temporarily disable)" -ForegroundColor DarkGray
    exit 1
}

# ---------------------------------------------------------------------------
# Step 7 - verify critical packages
# ---------------------------------------------------------------------------

Write-Step "Verifying critical packages installed"

$critical = @{
    'next'           = 'node_modules\next\package.json'
    'better-sqlite3' = 'node_modules\better-sqlite3\package.json'
    'better-sqlite3 native' = 'node_modules\better-sqlite3\build\Release\better_sqlite3.node'
    'keytar'         = 'node_modules\keytar\package.json'
    'keytar native'  = 'node_modules\keytar\build\Release\keytar.node'
    'drizzle-orm'    = 'node_modules\drizzle-orm\package.json'
    'react'          = 'node_modules\react\package.json'
    'vitest'         = 'node_modules\vitest\package.json'
}

$failures = @()
foreach ($name in $critical.Keys) {
    if (Test-Path $critical[$name]) {
        Write-Ok "$name present"
    } else {
        Write-Fail "$name MISSING : $($critical[$name])"
        $failures += $name
    }
}

if ($failures.Count -gt 0) {
    Write-Host ""
    Write-Host "  Some packages didn't install. Try:" -ForegroundColor Yellow
    foreach ($f in $failures) {
        if ($f -like '* native') {
            $pkg = $f -replace ' native', ''
            Write-Host "    npm rebuild $pkg" -ForegroundColor Cyan
        }
    }
    exit 1
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor DarkGray
Write-Host "  RECOVERY COMPLETE" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Next:" -ForegroundColor Cyan
Write-Host "    .\check.ps1     # full integrity check" -ForegroundColor White
Write-Host "    npm run dev     # start the dev server" -ForegroundColor White
Write-Host ""
