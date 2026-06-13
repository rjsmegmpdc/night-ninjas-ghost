# Quick fix for the "Missing script: test" error
#
# Paste this entire block into PowerShell from inside the project folder:
#   cd C:\Claude-Work\Project\night-ninjas-shadow-tracker
#   then paste the lines below.
#
# What it does:
#   1. Reads package.json
#   2. Checks if the 'test' script is present
#   3. If not, adds 'test' and 'test:watch' scripts and the vitest devDep
#   4. Writes package.json back
#
# Idempotent - safe to run multiple times.

$ErrorActionPreference = 'Stop'

if (-not (Test-Path 'package.json')) {
    Write-Host "package.json not found in current directory" -ForegroundColor Red
    exit 1
}

$pkg = Get-Content 'package.json' -Raw | ConvertFrom-Json
$changed = $false

# Ensure scripts.test exists
if (-not ($pkg.scripts.PSObject.Properties.Name -contains 'test')) {
    $pkg.scripts | Add-Member -NotePropertyName 'test' -NotePropertyValue 'vitest run'
    $changed = $true
    Write-Host "  Added scripts.test" -ForegroundColor Green
}
if (-not ($pkg.scripts.PSObject.Properties.Name -contains 'test:watch')) {
    $pkg.scripts | Add-Member -NotePropertyName 'test:watch' -NotePropertyValue 'vitest'
    $changed = $true
    Write-Host "  Added scripts.test:watch" -ForegroundColor Green
}

# Ensure devDependencies.vitest exists
if (-not ($pkg.devDependencies.PSObject.Properties.Name -contains 'vitest')) {
    $pkg.devDependencies | Add-Member -NotePropertyName 'vitest' -NotePropertyValue '^2.1.4'
    $changed = $true
    Write-Host "  Added devDependencies.vitest" -ForegroundColor Green
}

if ($changed) {
    # ConvertTo-Json with -Depth high enough for nested objects
    $pkg | ConvertTo-Json -Depth 10 | Set-Content 'package.json' -NoNewline
    Write-Host ""
    Write-Host "package.json updated. Now run:" -ForegroundColor Cyan
    Write-Host "  npm install" -ForegroundColor White
    Write-Host "  npm run test" -ForegroundColor White
} else {
    Write-Host "package.json already has test scripts and vitest devDep - nothing to do." -ForegroundColor Green
}
