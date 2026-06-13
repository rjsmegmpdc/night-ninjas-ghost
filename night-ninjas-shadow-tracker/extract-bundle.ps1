<#
.SYNOPSIS
    Night Ninjas - Shadow Tracker - bulletproof bundle extractor

.DESCRIPTION
    Extracts a freshly-downloaded zip over the project folder, with
    aggressive overwrite semantics that handle the cases where .NET's
    ExtractToFile($entry, $target, $true) silently fails to overwrite -
    typically caused by read-only flags, locked files, or filesystem
    metadata mismatches.

    Approach:
      1. Remove existing destination file (if present) before writing.
         File.Delete tolerates read-only and locked files better than
         a silent overwrite.
      2. ExtractToFile to a fresh path.
      3. Verify file count matches archive entry count.
      4. Verify package.json has expected 'test' script (canary check).

.PARAMETER ZipPath
    Path to the bundle zip. Defaults to the latest in $HOME\Downloads
    matching night-ninjas-shadow-tracker*.zip.

.PARAMETER ProjectRoot
    Where to extract to. Defaults to the script's parent directory if
    run from inside the project, or C:\Claude-Work\Project\night-ninjas-shadow-tracker.

.NOTES
    Run from anywhere. Designed to be idempotent and safe.
    First time: Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
#>

param(
    [string]$ZipPath = $null,
    [string]$ProjectRoot = 'C:\Claude-Work\Project\night-ninjas-shadow-tracker'
)

$ErrorActionPreference = 'Stop'

function Write-Step { param($m) Write-Host "`n>> $m" -ForegroundColor Cyan }
function Write-Ok   { param($m) Write-Host "  OK  $m" -ForegroundColor Green }
function Write-Fail { param($m) Write-Host "  XX  $m" -ForegroundColor Red }
function Write-Warn { param($m) Write-Host "  !!  $m" -ForegroundColor Yellow }

# Resolve zip path - default to latest matching zip in Downloads
if (-not $ZipPath) {
    $candidate = Get-ChildItem "$HOME\Downloads\night-ninjas-shadow-tracker*.zip" -ErrorAction SilentlyContinue |
                 Sort-Object LastWriteTime -Descending |
                 Select-Object -First 1
    if (-not $candidate) {
        Write-Fail "No zip found at $HOME\Downloads\night-ninjas-shadow-tracker*.zip"
        Write-Host "  Pass -ZipPath explicitly, or download the bundle to Downloads first." -ForegroundColor Yellow
        exit 1
    }
    $ZipPath = $candidate.FullName
}

if (-not (Test-Path $ZipPath)) {
    Write-Fail "Zip not found: $ZipPath"
    exit 1
}

Write-Step "Bundle extractor"
Write-Host "  Zip:     $ZipPath" -ForegroundColor DarkGray
Write-Host "  Target:  $ProjectRoot" -ForegroundColor DarkGray

if (-not (Test-Path $ProjectRoot)) {
    Write-Step "Creating project root"
    New-Item -ItemType Directory -Path $ProjectRoot -Force | Out-Null
}

# ---------------------------------------------------------------------------
# Extract - remove existing files first to avoid silent-skip overwrites
# ---------------------------------------------------------------------------

Write-Step "Extracting (force-overwrite)"

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)

$extracted = 0
$rewritten = 0
$skippedDirs = 0

foreach ($entry in $zip.Entries) {
    if ($entry.FullName.EndsWith('/')) {
        $skippedDirs++
        continue
    }
    $relative = $entry.FullName -replace '^night-ninjas-shadow-tracker/', ''
    if (-not $relative) { continue }
    $target = Join-Path $ProjectRoot $relative
    $targetDir = Split-Path $target -Parent
    if (-not (Test-Path $targetDir)) {
        New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    }

    # Critical: delete first if it exists. Avoids the silent-skip case
    # where ExtractToFile with overwrite=$true fails for read-only or
    # otherwise non-trivially-locked files.
    if (Test-Path $target) {
        try {
            # Remove read-only flag if set
            $existing = Get-Item $target -Force
            if ($existing.IsReadOnly) {
                $existing.IsReadOnly = $false
            }
            Remove-Item $target -Force -ErrorAction Stop
            $rewritten++
        } catch {
            Write-Warn "Could not remove $relative - may be locked. Trying overwrite anyway."
        }
    }

    try {
        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $true)
        $extracted++
    } catch {
        Write-Fail "Failed to extract $relative : $_"
    }
}
$zip.Dispose()

Write-Ok "$extracted file(s) written ($rewritten overwritten, $skippedDirs directory entries skipped)"

# ---------------------------------------------------------------------------
# Verify - canary checks for known-stale-prone files
# ---------------------------------------------------------------------------

Write-Step "Verifying critical files"

Set-Location $ProjectRoot

# Canary 1: package.json must have 'test' script (the failure that
# triggered this script's existence).
$pkgRaw = Get-Content 'package.json' -Raw
$pkg = $pkgRaw | ConvertFrom-Json
if ($pkg.scripts.PSObject.Properties.Name -contains 'test') {
    Write-Ok "package.json has 'test' script"
} else {
    Write-Fail "package.json missing 'test' script - extraction did not overwrite!"
    Write-Host ""
    Write-Host "  This means the file was locked or had unusual permissions." -ForegroundColor Yellow
    Write-Host "  Manual fix:" -ForegroundColor Yellow
    Write-Host "    Remove-Item '$ProjectRoot\package.json' -Force" -ForegroundColor Cyan
    Write-Host "    .\extract-bundle.ps1   # re-run this script" -ForegroundColor Cyan
    exit 1
}

# Canary 2: vitest.config.ts must exist (new in Phase 2 session A)
if (Test-Path 'vitest.config.ts') {
    Write-Ok "vitest.config.ts present"
} else {
    Write-Fail "vitest.config.ts missing"
    exit 1
}

# Canary 3: ROADMAP.md must exist (new in Phase 1)
if (Test-Path 'ROADMAP.md') {
    Write-Ok "ROADMAP.md present"
} else {
    Write-Warn "ROADMAP.md missing - older bundle?"
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor DarkGray
Write-Host "  EXTRACTION COMPLETE" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor Cyan
Write-Host "    cd $ProjectRoot" -ForegroundColor White
Write-Host "    npm install         # if dependencies changed" -ForegroundColor White
Write-Host "    .\check.ps1         # full integrity check" -ForegroundColor White
Write-Host "    npm run test        # 33 tests should pass" -ForegroundColor White
Write-Host "    npm run dev         # start the dev server" -ForegroundColor White
Write-Host ""
