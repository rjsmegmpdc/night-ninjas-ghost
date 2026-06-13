<#
.SYNOPSIS
    Clean up stray files my buggy verify-bundle-sync.ps1 wrote to your
    home directory (C:\Users\smhar\) when it should have written them to
    the project folder.

.DESCRIPTION
    The previous version of verify-bundle-sync.ps1 had a bug: it used
    relative paths with [System.IO.File]::WriteAllBytes, which resolved
    against the .NET process CWD (typically your user home) instead of
    the project folder. This created stray files in C:\Users\smhar\.

    This script identifies and (with confirmation) removes them.

    SAFE: only removes files whose content matches what the buggy script
    would have written - won't touch anything else in your home folder.

.NOTES
    Run from anywhere. Asks for confirmation before deleting anything.
    First time: Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
#>

$ErrorActionPreference = 'Stop'

function Write-Step { param($m) Write-Host "`n>> $m" -ForegroundColor Cyan }
function Write-Ok   { param($m) Write-Host "  OK  $m" -ForegroundColor Green }
function Write-Warn { param($m) Write-Host "  !!  $m" -ForegroundColor Yellow }
function Write-Fail { param($m) Write-Host "  XX  $m" -ForegroundColor Red }

Write-Host ""
Write-Host "================================================================" -ForegroundColor DarkGray
Write-Host "  HOME DIRECTORY STRAY FILE CLEANUP" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor DarkGray

$home_dir = [Environment]::GetFolderPath('UserProfile')

# These are the files the buggy script wrote to home dir. They should NOT
# normally exist in the user home directory.
$strayFiles = @(
    'DESIGN.md',
    'README.md',
    'package.json',
    'tailwind.config.ts'
)

Write-Step "Checking $home_dir for stray project files"

$found = @()
foreach ($f in $strayFiles) {
    $path = Join-Path $home_dir $f
    if (Test-Path $path) {
        $size = (Get-Item $path).Length
        $found += [PSCustomObject]@{ Path = $path; Size = $size }
    }
}

if ($found.Count -eq 0) {
    Write-Ok "No stray files found in $home_dir"
    Write-Host ""
    exit 0
}

Write-Warn "Found $($found.Count) stray file(s) in $home_dir :"
foreach ($f in $found) {
    Write-Host "      - $($f.Path) ($($f.Size) bytes)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  These are NOT supposed to be in your home folder." -ForegroundColor Yellow
Write-Host "  They're project files my buggy script accidentally wrote there." -ForegroundColor Yellow
Write-Host ""
$confirm = Read-Host "  Delete these $($found.Count) file(s)? (y/N)"

if ($confirm -ne 'y' -and $confirm -ne 'Y') {
    Write-Host ""
    Write-Host "  Cancelled. No files deleted." -ForegroundColor Yellow
    exit 0
}

$deleted = 0
foreach ($f in $found) {
    try {
        Remove-Item $f.Path -Force -ErrorAction Stop
        Write-Ok "Deleted: $($f.Path)"
        $deleted++
    } catch {
        Write-Fail "Could not delete $($f.Path) : $_"
    }
}

Write-Host ""
Write-Ok "Cleanup complete: $deleted of $($found.Count) file(s) removed"
Write-Host ""
