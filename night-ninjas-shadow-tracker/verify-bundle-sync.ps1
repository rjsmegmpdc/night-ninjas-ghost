<#
.SYNOPSIS
    Verify on-disk files match the bundle manifest, force-fix any drift.

.DESCRIPTION
    The bundle ships with bundle-manifest.json containing SHA-256 hashes
    of every file in the bundle. This script compares each file on disk
    against the manifest. Any drift (size mismatch or hash mismatch) is
    flagged, and you can choose to force-extract from the zip to fix.

    Catches the silent-overwrite-failure case where:
      1. Extraction "succeeded" but didn't actually overwrite a file
      2. The file on disk is therefore stale (older content)
      3. Dev server compiles and serves the stale content
      4. You see a UI that doesn't match the latest code

    This has happened to package.json, app/(app)/patrol/page.tsx, and
    potentially others. Run this any time the dev server's UI doesn't
    match what you'd expect from the latest bundle.

.PARAMETER ZipPath
    Path to the bundle zip. Defaults to latest in $HOME\Downloads matching
    night-ninjas-shadow-tracker*.zip.

.PARAMETER FixDrift
    If specified, automatically extracts the correct content from the zip
    for any files that don't match the manifest. Without this flag, the
    script only reports drift.

.NOTES
    First time: Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
    Stop dev server before running with -FixDrift (Ctrl+C in the dev terminal).
#>

param(
    [string]$ZipPath = $null,
    [switch]$FixDrift
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSCommandPath
Set-Location $ProjectRoot
# Critical: PowerShell's Set-Location does NOT update .NET's process CWD.
# Without this, [System.IO.File]::WriteAllBytes(relative-path, ...) resolves
# the relative path against whatever directory the PowerShell session was
# started in (typically the user's home), and writes to the wrong place.
[System.IO.Directory]::SetCurrentDirectory($ProjectRoot)

function Write-Step { param($m) Write-Host "`n>> $m" -ForegroundColor Cyan }
function Write-Ok   { param($m) Write-Host "  OK  $m" -ForegroundColor Green }
function Write-Fail { param($m) Write-Host "  XX  $m" -ForegroundColor Red }
function Write-Warn { param($m) Write-Host "  !!  $m" -ForegroundColor Yellow }
function Write-Action { param($m) Write-Host "  ->  $m" -ForegroundColor Magenta }

Write-Host ""
Write-Host "================================================================" -ForegroundColor DarkGray
Write-Host "  BUNDLE SYNC VERIFIER" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor DarkGray

# ---------------------------------------------------------------------------
# Load manifest
# ---------------------------------------------------------------------------

if (-not (Test-Path 'bundle-manifest.json')) {
    Write-Fail "bundle-manifest.json missing"
    Write-Host "  Re-extract the latest bundle and run this script again." -ForegroundColor Yellow
    exit 1
}

$manifest = Get-Content 'bundle-manifest.json' -Raw | ConvertFrom-Json
$manifestEntries = @($manifest.PSObject.Properties)
Write-Step "Loaded manifest with $($manifestEntries.Count) files"

# ---------------------------------------------------------------------------
# Compare each file on disk against manifest
# ---------------------------------------------------------------------------

Write-Step "Verifying files against manifest"

$drift = @()
$missing = @()
$ok = 0

foreach ($entry in $manifestEntries) {
    $relPath = $entry.Name
    $expected = $entry.Value
    $diskPath = Join-Path $ProjectRoot $relPath

    if (-not (Test-Path $diskPath)) {
        $missing += $relPath
        continue
    }

    $diskSize = (Get-Item $diskPath -Force).Length
    if ($diskSize -ne $expected.size) {
        $drift += [PSCustomObject]@{
            Path = $relPath
            DiskSize = $diskSize
            ExpectedSize = $expected.size
            Reason = "size mismatch"
        }
        continue
    }

    # Size matches - verify hash for files most likely to drift
    $hash = (Get-FileHash $diskPath -Algorithm SHA256).Hash.ToLower()
    if ($hash -ne $expected.sha256) {
        $drift += [PSCustomObject]@{
            Path = $relPath
            DiskSize = $diskSize
            ExpectedSize = $expected.size
            Reason = "hash mismatch"
        }
    } else {
        $ok++
    }
}

Write-Ok "$ok of $($manifestEntries.Count) files match manifest"

if ($missing.Count -gt 0) {
    Write-Fail "$($missing.Count) file(s) missing from disk:"
    foreach ($m in $missing | Select-Object -First 10) {
        Write-Host "      - $m" -ForegroundColor Red
    }
    if ($missing.Count -gt 10) {
        Write-Host "      ... and $($missing.Count - 10) more" -ForegroundColor DarkGray
    }
}

if ($drift.Count -gt 0) {
    Write-Fail "$($drift.Count) file(s) have drifted from bundle:"
    foreach ($d in $drift | Select-Object -First 20) {
        Write-Host "      - $($d.Path)  ($($d.Reason): disk=$($d.DiskSize)b expected=$($d.ExpectedSize)b)" -ForegroundColor Red
    }
    if ($drift.Count -gt 20) {
        Write-Host "      ... and $($drift.Count - 20) more" -ForegroundColor DarkGray
    }
}

if ($missing.Count -eq 0 -and $drift.Count -eq 0) {
    Write-Host ""
    Write-Host "  No drift detected. Disk matches bundle." -ForegroundColor Green
    Write-Host ""
    exit 0
}

# ---------------------------------------------------------------------------
# Fix drift (only if -FixDrift)
# ---------------------------------------------------------------------------

if (-not $FixDrift) {
    Write-Host ""
    Write-Host "  To force-fix the drift, re-run with:" -ForegroundColor Yellow
    Write-Host "    .\verify-bundle-sync.ps1 -FixDrift" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Stop the dev server first (Ctrl+C in the dev terminal)." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# Resolve zip path
if (-not $ZipPath) {
    $candidate = Get-ChildItem "$HOME\Downloads\night-ninjas-shadow-tracker*.zip" -ErrorAction SilentlyContinue |
                 Sort-Object LastWriteTime -Descending |
                 Select-Object -First 1
    if (-not $candidate) {
        Write-Fail "No zip found at $HOME\Downloads\night-ninjas-shadow-tracker*.zip"
        Write-Host "  Pass -ZipPath explicitly." -ForegroundColor Yellow
        exit 1
    }
    $ZipPath = $candidate.FullName
}

if (-not (Test-Path $ZipPath)) {
    Write-Fail "Zip not found: $ZipPath"
    exit 1
}

# Stop any node processes that might be holding files open
Write-Step "Stopping any lingering node processes"
$nodes = Get-Process node -ErrorAction SilentlyContinue
if ($nodes) {
    foreach ($n in $nodes) {
        try {
            Stop-Process -Id $n.Id -Force -ErrorAction Stop
            Write-Action "Stopped node.exe pid=$($n.Id)"
        } catch {
            Write-Warn "Could not stop pid=$($n.Id): $_"
        }
    }
} else {
    Write-Ok "No lingering node processes"
}

# Force-extract drifted files from zip
Write-Step "Force-extracting $($drift.Count + $missing.Count) file(s) from zip"

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)

$toFix = @()
foreach ($d in $drift) { $toFix += $d.Path }
foreach ($m in $missing) { $toFix += $m }

$fixed = 0
$failed = @()

foreach ($targetRel in $toFix) {
    # Find matching entry in zip (zip uses forward slashes)
    $entryName = "night-ninjas-shadow-tracker/" + ($targetRel -replace '\\', '/')
    $entry = $zip.Entries | Where-Object { $_.FullName -eq $entryName } | Select-Object -First 1

    if (-not $entry) {
        Write-Warn "Not in zip: $targetRel"
        $failed += $targetRel
        continue
    }

    $diskPath = Join-Path $ProjectRoot $targetRel
    $targetDir = Split-Path $diskPath -Parent
    if ($targetDir -and -not (Test-Path $targetDir)) {
        New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    }

    # Bulletproof overwrite: read entry into memory, write atomically
    try {
        if (Test-Path $diskPath) {
            $existing = Get-Item $diskPath -Force
            if ($existing.IsReadOnly) { $existing.IsReadOnly = $false }
            Remove-Item $diskPath -Force -ErrorAction Stop
        }

        # Read entry bytes
        $stream = $entry.Open()
        $ms = New-Object System.IO.MemoryStream
        $stream.CopyTo($ms)
        $stream.Close()
        $bytes = $ms.ToArray()
        $ms.Close()

        # Write atomically via WriteAllBytes (more reliable than ExtractToFile)
        [System.IO.File]::WriteAllBytes($diskPath, $bytes)

        $fixed++
        Write-Action "Fixed: $targetRel"
    } catch {
        Write-Warn "Failed: $targetRel : $_"
        $failed += $targetRel
    }
}

$zip.Dispose()

Write-Host ""
if ($failed.Count -eq 0) {
    Write-Ok "All $fixed file(s) force-synced from bundle"
} else {
    Write-Fail "$($failed.Count) file(s) could not be fixed:"
    foreach ($f in $failed) { Write-Host "      - $f" -ForegroundColor Red }
    Write-Host ""
    Write-Host "  These files are likely held open by an editor (VS Code, etc.)." -ForegroundColor Yellow
    Write-Host "  Close all editors and re-run with -FixDrift." -ForegroundColor Yellow
}

# Verify .next is cleared
if (Test-Path '.next') {
    Write-Step "Clearing .next cache (stale compiled output)"
    try {
        Remove-Item -Recurse -Force .next -ErrorAction Stop
        Write-Ok ".next cleared"
    } catch {
        Write-Warn "Could not clear .next: $_"
    }
}

Write-Host ""
Write-Host "  Next:" -ForegroundColor Cyan
Write-Host "    .\check.ps1     # full integrity check" -ForegroundColor White
Write-Host "    npm run dev     # start dev server with fresh code" -ForegroundColor White
Write-Host ""
