<#
.SYNOPSIS
    One-shot GitHub setup and push for the Night Ninjas Shadow Tracker
    project. Validates everything up front, fixes what it can, and only
    asks you to act when something genuinely needs your input.

.DESCRIPTION
    Handles the full pipeline from "no git here" to "code on GitHub":

      1. Verify git installed (winget install if missing)
      2. Verify gh CLI installed (winget install if missing)
      3. Verify gh authenticated (prompt gh auth login if not)
      4. Verify .gitignore is present and protective
      5. Audit for leaked secrets in the project
      6. Initialise repo if needed
      7. Stage, commit, push - creating remote repo if it doesn't exist

    Designed to be runnable repeatedly (idempotent). Subsequent runs
    skip already-completed steps and just commit/push new changes.

.PARAMETER RepoName
    GitHub repository name. Default: night-ninjas-shadow-tracker.

.PARAMETER Visibility
    Repository visibility. Default: private. Allowed: private, public.

.PARAMETER CommitMessage
    Override the auto-generated commit message.

.PARAMETER SkipSecretAudit
    Bypass the secret-leak audit. Use only if you've manually verified.

.PARAMETER DryRun
    Run all checks and validations but don't commit/push. Useful first
    pass to see what the script will do.

.NOTES
    First time: Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
#>

param(
    [string]$RepoName = 'night-ninjas-shadow-tracker',
    [ValidateSet('private', 'public')][string]$Visibility = 'private',
    [string]$CommitMessage = '',
    [switch]$SkipSecretAudit,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSCommandPath
Set-Location $ProjectRoot
[System.IO.Directory]::SetCurrentDirectory($ProjectRoot)

function Write-Step    { param($m) Write-Host "`n>> $m" -ForegroundColor Cyan }
function Write-Ok      { param($m) Write-Host "  OK  $m" -ForegroundColor Green }
function Write-Fail    { param($m) Write-Host "  XX  $m" -ForegroundColor Red }
function Write-Warn    { param($m) Write-Host "  !!  $m" -ForegroundColor Yellow }
function Write-Action  { param($m) Write-Host "  ->  $m" -ForegroundColor Magenta }
function Write-Info    { param($m) Write-Host "      $m" -ForegroundColor DarkGray }

Write-Host ""
Write-Host "================================================================" -ForegroundColor DarkGray
Write-Host "  GITHUB SETUP - NIGHT NINJAS SHADOW TRACKER" -ForegroundColor White
Write-Host "  Repo: $RepoName ($Visibility)" -ForegroundColor DarkGray
if ($DryRun) { Write-Host "  Mode: DRY RUN - no changes will be made" -ForegroundColor Yellow }
Write-Host "================================================================" -ForegroundColor DarkGray

# Track problems that need user action so we can show them in one summary
$blockers = @()

# ---------------------------------------------------------------------------
# Step 1 - git installed
# ---------------------------------------------------------------------------

Write-Step "Step 1 - git installed?"

$gitVersion = $null
try {
    $gitVersion = (git --version 2>&1) -replace 'git version ', ''
    Write-Ok "git $gitVersion"
} catch {
    Write-Warn "git not found"
    if ($DryRun) {
        $blockers += 'git not installed - run "winget install --id Git.Git" before retrying'
    } else {
        Write-Action "Installing git via winget"
        try {
            winget install --id Git.Git --silent --accept-source-agreements --accept-package-agreements
            Write-Ok "git installed - YOU MUST CLOSE AND REOPEN POWERSHELL for PATH changes to take effect"
            Write-Warn "Re-run this script after restarting PowerShell"
            exit 0
        } catch {
            $blockers += "Could not auto-install git: $($_.Exception.Message)"
        }
    }
}

# ---------------------------------------------------------------------------
# Step 2 - gh CLI installed
# ---------------------------------------------------------------------------

Write-Step "Step 2 - GitHub CLI installed?"

$ghVersion = $null
try {
    $ghVersionRaw = gh --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        $ghVersion = ($ghVersionRaw | Select-Object -First 1) -replace 'gh version ', ''
        Write-Ok "gh $ghVersion"
    } else {
        throw "gh exited with code $LASTEXITCODE"
    }
} catch {
    Write-Warn "gh CLI not found"
    if ($DryRun) {
        $blockers += 'gh CLI not installed - run "winget install --id GitHub.cli" before retrying'
    } else {
        Write-Action "Installing GitHub CLI via winget"
        try {
            winget install --id GitHub.cli --silent --accept-source-agreements --accept-package-agreements
            Write-Ok "gh installed - YOU MUST CLOSE AND REOPEN POWERSHELL for PATH changes to take effect"
            Write-Warn "Re-run this script after restarting PowerShell"
            exit 0
        } catch {
            $blockers += "Could not auto-install gh: $($_.Exception.Message)"
        }
    }
}

# ---------------------------------------------------------------------------
# Step 3 - gh authenticated
# ---------------------------------------------------------------------------

Write-Step "Step 3 - GitHub CLI authenticated?"

$ghAuth = $null
$ghUser = $null
try {
    $ghAuthRaw = gh auth status 2>&1
    if ($LASTEXITCODE -eq 0) {
        # Extract username from output if possible
        $userMatch = $ghAuthRaw | Select-String -Pattern 'Logged in to .+ as (\S+)' | Select-Object -First 1
        if ($userMatch) { $ghUser = $userMatch.Matches[0].Groups[1].Value }
        Write-Ok "Authenticated$(if ($ghUser) { ' as ' + $ghUser })"
    } else {
        throw "Not authenticated"
    }
} catch {
    Write-Warn "gh CLI is installed but not authenticated"
    if ($DryRun) {
        $blockers += 'gh CLI not authenticated - run "gh auth login" before retrying'
    } else {
        Write-Action "Triggering gh auth login (you will need to interact with the browser)"
        Write-Info "Pick: GitHub.com -> HTTPS -> Login with a web browser"
        gh auth login
        if ($LASTEXITCODE -ne 0) {
            $blockers += 'gh auth login was cancelled or failed - re-run this script after authenticating'
        } else {
            Write-Ok "Authentication complete"
            $ghAuthRaw = gh auth status 2>&1
            $userMatch = $ghAuthRaw | Select-String -Pattern 'Logged in to .+ as (\S+)' | Select-Object -First 1
            if ($userMatch) { $ghUser = $userMatch.Matches[0].Groups[1].Value }
        }
    }
}

# Bail early if any of the prereqs above failed
if ($blockers.Count -gt 0) {
    Write-Host ""
    Write-Host "----------------------------------------------------------------" -ForegroundColor Red
    Write-Host "  BLOCKERS - cannot proceed:" -ForegroundColor Red
    foreach ($b in $blockers) { Write-Host "    - $b" -ForegroundColor Red }
    Write-Host "----------------------------------------------------------------" -ForegroundColor Red
    Write-Host ""
    exit 1
}

# ---------------------------------------------------------------------------
# Step 4 - .gitignore present and protective
# ---------------------------------------------------------------------------

Write-Step "Step 4 - .gitignore is protective?"

$requiredIgnorePatterns = @(
    'node_modules',
    '.next',
    '*.db',
    '.env',
    '.env.local'
)

$gitignoreExists = Test-Path '.gitignore'
$missingPatterns = @()

if ($gitignoreExists) {
    $gitignoreContent = Get-Content '.gitignore' -Raw
    foreach ($pattern in $requiredIgnorePatterns) {
        if ($gitignoreContent -notmatch [regex]::Escape($pattern)) {
            $missingPatterns += $pattern
        }
    }
    if ($missingPatterns.Count -eq 0) {
        Write-Ok ".gitignore covers all critical patterns"
    } else {
        Write-Warn ".gitignore is missing protections:"
        foreach ($p in $missingPatterns) { Write-Info "missing: $p" }
        $blockers += '.gitignore is missing critical patterns - review before committing'
    }
} else {
    Write-Warn ".gitignore is missing entirely"
    $blockers += 'No .gitignore - run this script after extracting the latest bundle (it ships .gitignore)'
}

# ---------------------------------------------------------------------------
# Step 5 - secret leak audit
# ---------------------------------------------------------------------------

Write-Step "Step 5 - secret leak audit"

if ($SkipSecretAudit) {
    Write-Warn "Skipped (you passed -SkipSecretAudit)"
} else {
    $secretPatterns = @(
        # Hardcoded common credential names with realistic-looking values
        '(?i)client_secret\s*[:=]\s*["''][a-zA-Z0-9_\-]{16,}["'']',
        '(?i)api[-_ ]?key\s*[:=]\s*["''][a-zA-Z0-9_\-]{16,}["'']',
        '(?i)access[-_ ]?token\s*[:=]\s*["''][a-zA-Z0-9_\-]{16,}["'']',
        '(?i)refresh[-_ ]?token\s*[:=]\s*["''][a-zA-Z0-9_\-]{16,}["'']',
        # Strava-specific
        'STRAVA_CLIENT_SECRET\s*=\s*[a-zA-Z0-9]{16,}',
        # Anthropic
        'sk-ant-[a-zA-Z0-9_\-]{20,}',
        # GitHub PATs
        'ghp_[a-zA-Z0-9]{30,}',
        'github_pat_[a-zA-Z0-9_]{30,}'
    )

    # Skip generated/binary/vendored content that creates false positives
    $excludePathPatterns = @(
        '\\node_modules\\',
        '\\\.next\\',
        '\\dist\\',
        '\\\.git\\',
        '\\bundle-manifest\.json$',
        '\\package-lock\.json$'
    )

    $candidateFiles = Get-ChildItem -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object {
            $path = $_.FullName
            $skip = $false
            foreach ($ex in $excludePathPatterns) {
                if ($path -match $ex) { $skip = $true; break }
            }
            (-not $skip) -and ($_.Extension -in '.ts', '.tsx', '.js', '.jsx', '.json', '.env', '.md', '.ps1', '.html', '.css')
        }

    $hits = @()
    foreach ($file in $candidateFiles) {
        try {
            $content = Get-Content $file.FullName -Raw -ErrorAction Stop
            foreach ($pattern in $secretPatterns) {
                $match = [regex]::Match($content, $pattern)
                if ($match.Success) {
                    $relPath = $file.FullName.Substring($ProjectRoot.Length + 1)
                    $excerpt = $match.Value
                    if ($excerpt.Length -gt 60) { $excerpt = $excerpt.Substring(0, 60) + '...' }
                    $hits += [PSCustomObject]@{ Path = $relPath; Match = $excerpt }
                }
            }
        } catch { }
    }

    if ($hits.Count -gt 0) {
        Write-Fail "$($hits.Count) potential secret(s) found:"
        foreach ($h in $hits) {
            Write-Host "      $($h.Path)" -ForegroundColor Red
            Write-Host "        -> $($h.Match)" -ForegroundColor DarkGray
        }
        Write-Host ""
        Write-Host "      Review each match. If they are placeholder/template values, you can:" -ForegroundColor Yellow
        Write-Host "        - Replace them with environment variables" -ForegroundColor Yellow
        Write-Host "        - Re-run with -SkipSecretAudit (only if confirmed safe)" -ForegroundColor Yellow
        $blockers += "Secret audit found $($hits.Count) suspicious value(s)"
    } else {
        Write-Ok "No secret patterns detected in committed file types"
    }
}

# Bail if blockers
if ($blockers.Count -gt 0) {
    Write-Host ""
    Write-Host "----------------------------------------------------------------" -ForegroundColor Red
    Write-Host "  BLOCKERS - cannot proceed safely:" -ForegroundColor Red
    foreach ($b in $blockers) { Write-Host "    - $b" -ForegroundColor Red }
    Write-Host "----------------------------------------------------------------" -ForegroundColor Red
    Write-Host ""
    exit 1
}

# ---------------------------------------------------------------------------
# Step 6 - repo state
# ---------------------------------------------------------------------------

Write-Step "Step 6 - local repo state"

$repoExists = Test-Path '.git'
$remoteUrl = $null
$currentBranch = $null

if ($repoExists) {
    try {
        $remoteUrl = (git remote get-url origin 2>&1)
        if ($LASTEXITCODE -ne 0) { $remoteUrl = $null }
    } catch { $remoteUrl = $null }
    try {
        $currentBranch = (git rev-parse --abbrev-ref HEAD 2>&1)
        if ($LASTEXITCODE -ne 0) { $currentBranch = $null }
    } catch { $currentBranch = $null }

    if ($remoteUrl) {
        Write-Ok "Repo exists, remote: $remoteUrl"
    } else {
        Write-Warn "Repo exists but no remote configured"
    }
    if ($currentBranch) { Write-Info "current branch: $currentBranch" }
} else {
    Write-Warn "No git repository here yet"
}

if ($DryRun) {
    Write-Host ""
    Write-Host "================================================================" -ForegroundColor DarkGray
    Write-Host "  DRY RUN COMPLETE" -ForegroundColor White
    Write-Host "  All prereqs OK. Re-run without -DryRun to actually push." -ForegroundColor Green
    Write-Host "================================================================" -ForegroundColor DarkGray
    Write-Host ""
    exit 0
}

# ---------------------------------------------------------------------------
# Step 7 - initialise repo if needed
# ---------------------------------------------------------------------------

if (-not $repoExists) {
    Write-Step "Step 7 - initialising local repo"
    git init -b main 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        # Some older git versions don't support -b; fall back
        git init 2>&1 | Out-Null
        git symbolic-ref HEAD refs/heads/main 2>&1 | Out-Null
    }
    Write-Ok "git init complete (default branch: main)"
} else {
    Write-Step "Step 7 - skipped (repo exists)"
}

# ---------------------------------------------------------------------------
# Step 8 - configure user.name / user.email if not set
# ---------------------------------------------------------------------------

Write-Step "Step 8 - git user identity"

$gitUserName = (git config user.name 2>&1)
$gitUserEmail = (git config user.email 2>&1)

if (-not $gitUserName -or $LASTEXITCODE -ne 0) {
    if ($ghUser) {
        git config user.name $ghUser
        Write-Action "Set user.name to gh username: $ghUser"
    } else {
        Write-Warn "user.name not set and no gh username available"
        $blockers += 'Run: git config user.name "Your Name"'
    }
} else {
    Write-Ok "user.name: $gitUserName"
}

if (-not $gitUserEmail -or $LASTEXITCODE -ne 0) {
    if ($ghUser) {
        # GitHub no-reply email pattern
        $noReplyEmail = "$ghUser@users.noreply.github.com"
        git config user.email $noReplyEmail
        Write-Action "Set user.email to GitHub no-reply: $noReplyEmail"
    } else {
        Write-Warn "user.email not set"
        $blockers += 'Run: git config user.email "you@example.com"'
    }
} else {
    Write-Ok "user.email: $gitUserEmail"
}

if ($blockers.Count -gt 0) {
    Write-Host ""
    foreach ($b in $blockers) { Write-Fail $b }
    exit 1
}

# ---------------------------------------------------------------------------
# Step 9 - status / diff
# ---------------------------------------------------------------------------

Write-Step "Step 9 - what is about to be committed"

$status = git status --porcelain 2>&1
if (-not $status) {
    Write-Ok "Working tree clean - nothing to commit"
    if (-not $remoteUrl) {
        Write-Warn "But no remote yet - we'll create one and push the existing HEAD"
    } else {
        Write-Host ""
        Write-Host "  Nothing to do. Repo is up to date." -ForegroundColor Green
        Write-Host ""
        exit 0
    }
} else {
    $changedCount = ($status -split "`n").Count
    Write-Ok "$changedCount file change(s) detected"

    # Show a brief preview - first 15 entries
    $preview = $status -split "`n" | Select-Object -First 15
    foreach ($line in $preview) { Write-Info $line }
    if ($changedCount -gt 15) { Write-Info "... and $($changedCount - 15) more" }
}

# ---------------------------------------------------------------------------
# Step 10 - stage + commit
# ---------------------------------------------------------------------------

Write-Step "Step 10 - stage + commit"

git add .
if ($LASTEXITCODE -ne 0) {
    Write-Fail "git add failed"
    exit 1
}

# Build commit message - either user-supplied or derived from bundle version
$message = $CommitMessage
if (-not $message) {
    if (Test-Path 'bundle-version.json') {
        try {
            $bv = Get-Content 'bundle-version.json' -Raw | ConvertFrom-Json
            $message = "Update to bundle $($bv.hash) ($($bv.builtAt), $($bv.fileCount) files)"
        } catch {
            $message = "Update project state"
        }
    } else {
        $message = "Update project state"
    }
}

# Detect if this is the first commit (no HEAD)
$hasCommits = $true
git rev-parse HEAD 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { $hasCommits = $false }

if (-not $hasCommits) {
    $message = "Initial commit - $message"
}

# Try the commit; surface any error clearly
$commitOutput = git commit -m $message 2>&1
if ($LASTEXITCODE -ne 0) {
    if ($commitOutput -match 'nothing to commit') {
        Write-Ok "Nothing new to commit"
    } else {
        Write-Fail "git commit failed:"
        Write-Info "$commitOutput"
        exit 1
    }
} else {
    Write-Ok "Committed: $message"
}

# ---------------------------------------------------------------------------
# Step 11 - create remote if needed, then push
# ---------------------------------------------------------------------------

Write-Step "Step 11 - push to GitHub"

if (-not $remoteUrl) {
    Write-Action "Creating remote repo: $RepoName ($Visibility)"
    $createOutput = gh repo create $RepoName --$Visibility --source=. --remote=origin --push 2>&1
    if ($LASTEXITCODE -ne 0) {
        # Common: repo already exists on GitHub. Try linking to it.
        if ($createOutput -match 'already exists') {
            Write-Warn "Repo $RepoName already exists on GitHub - linking"
            $owner = $ghUser
            if (-not $owner) {
                Write-Fail "Could not determine GitHub username; cannot link"
                exit 1
            }
            git remote add origin "https://github.com/$owner/$RepoName.git"
            git push -u origin main 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Write-Fail "Push to existing remote failed - check the repo URL and try manually"
                exit 1
            }
            Write-Ok "Linked to existing remote and pushed"
        } else {
            Write-Fail "gh repo create failed:"
            Write-Info "$createOutput"
            exit 1
        }
    } else {
        Write-Ok "Repo created and pushed: $RepoName"
    }
} else {
    Write-Action "Pushing to existing remote: $remoteUrl"
    $pushOutput = git push origin HEAD 2>&1
    if ($LASTEXITCODE -ne 0) {
        # First-push case: branch isn't tracked yet
        if ($pushOutput -match 'no upstream branch') {
            git push -u origin HEAD 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Write-Fail "Push failed - check remote and credentials"
                exit 1
            }
        } else {
            Write-Fail "Push failed:"
            Write-Info "$pushOutput"
            exit 1
        }
    }
    Write-Ok "Push complete"
}

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

# Final repo URL
$finalRemote = (git remote get-url origin 2>&1)
$webUrl = $finalRemote -replace '\.git$', '' -replace '^git@github\.com:', 'https://github.com/'

Write-Host ""
Write-Host "================================================================" -ForegroundColor DarkGray
Write-Host "  ALL DONE" -ForegroundColor Green
Write-Host "  Repo: $webUrl" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor DarkGray
Write-Host ""
