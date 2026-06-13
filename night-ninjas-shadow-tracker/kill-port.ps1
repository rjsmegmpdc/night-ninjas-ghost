<#
.SYNOPSIS
    Free a TCP port by stopping whatever process is holding it.

.DESCRIPTION
    Common case: the dev server crashed or was Ctrl+C'd hard, leaving
    a node.exe process still bound to port 3000. Next time you run
    `npm run dev`, Next.js falls back to port 3001 and warns "Port 3000
    is in use". This helper finds and kills the holding process.

    By default targets port 3000 (Next.js dev server). Pass -Port to
    target any other port (3001 fallback, 5432 postgres, etc).

    Lists what it's about to kill and asks for confirmation, unless
    -Force is passed.

.PARAMETER Port
    The TCP port to free. Defaults to 3000.

.PARAMETER Force
    Skip the confirmation prompt. Useful for scripted use.

.EXAMPLE
    .\kill-port.ps1
    # Frees port 3000 with confirmation

.EXAMPLE
    .\kill-port.ps1 -Port 3001 -Force
    # Frees port 3001 immediately, no prompt

.NOTES
    First time: Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
#>

param(
    [int]$Port = 3000,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

function Write-Step { param($m) Write-Host "`n>> $m" -ForegroundColor Cyan }
function Write-Ok   { param($m) Write-Host "  OK  $m" -ForegroundColor Green }
function Write-Warn { param($m) Write-Host "  !!  $m" -ForegroundColor Yellow }
function Write-Fail { param($m) Write-Host "  XX  $m" -ForegroundColor Red }
function Write-Action { param($m) Write-Host "  ->  $m" -ForegroundColor Magenta }

Write-Host ""
Write-Host "================================================================" -ForegroundColor DarkGray
Write-Host "  KILL PORT $Port" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor DarkGray

Write-Step "Looking for processes on port $Port"

$connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue

if (-not $connections -or $connections.Count -eq 0) {
    Write-Ok "Port $Port is already free"
    Write-Host ""
    exit 0
}

# Get unique PIDs and their process info
$pidsToKill = @()
foreach ($conn in $connections) {
    $procPid = $conn.OwningProcess
    if ($procPid -eq 0) { continue }  # System idle
    if ($pidsToKill.Id -contains $procPid) { continue }  # Already added

    try {
        $proc = Get-Process -Id $procPid -ErrorAction Stop
        $pidsToKill += [PSCustomObject]@{
            Id          = $procPid
            Name        = $proc.ProcessName
            Path        = $proc.Path
            StartTime   = $proc.StartTime
            State       = $conn.State
        }
    } catch {
        # Process may have died between Get-NetTCPConnection and Get-Process
        Write-Warn "Could not query PID $procPid : $($_.Exception.Message)"
    }
}

if ($pidsToKill.Count -eq 0) {
    Write-Warn "Port $Port has connections but no killable processes (likely system-owned)"
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "  Processes holding port $Port :" -ForegroundColor Yellow
foreach ($p in $pidsToKill) {
    $startStr = if ($p.StartTime) { $p.StartTime.ToString('HH:mm:ss') } else { '?' }
    Write-Host "      PID $($p.Id)  $($p.Name)  (started $startStr, state $($p.State))" -ForegroundColor Yellow
    if ($p.Path) {
        Write-Host "        $($p.Path)" -ForegroundColor DarkGray
    }
}

if (-not $Force) {
    Write-Host ""
    $confirm = Read-Host "  Kill these $($pidsToKill.Count) process(es)? (y/N)"
    if ($confirm -ne 'y' -and $confirm -ne 'Y') {
        Write-Host ""
        Write-Host "  Cancelled. No processes killed." -ForegroundColor Yellow
        exit 0
    }
}

Write-Step "Killing processes"

$killed = 0
$failed = 0
foreach ($p in $pidsToKill) {
    try {
        Stop-Process -Id $p.Id -Force -ErrorAction Stop
        Write-Action "Killed PID $($p.Id) ($($p.Name))"
        $killed++
    } catch {
        Write-Fail "Could not kill PID $($p.Id) : $($_.Exception.Message)"
        $failed++
    }
}

# Brief pause and re-check to confirm port is free
Start-Sleep -Milliseconds 200

$stillHeld = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
if (-not $stillHeld -or $stillHeld.Count -eq 0) {
    Write-Host ""
    Write-Ok "Port $Port is now free ($killed killed, $failed failed)"
} else {
    Write-Host ""
    Write-Warn "Port $Port still held after kill - $($stillHeld.Count) connection(s) remaining"
    Write-Host "  This can happen if the OS hasn't released the socket yet (TIME_WAIT)." -ForegroundColor DarkGray
    Write-Host "  Wait 30 seconds and try binding again." -ForegroundColor DarkGray
}

Write-Host ""
