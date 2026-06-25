# Commit-on-stop: checkpoint uncommitted work at the end of every agent session.
# Runs on the Stop hook. Creates a "session checkpoint" commit if there are changes.
# Adapted from anthropics/cwc-long-running-agents (Apache-2.0)

# Nothing to do if working tree is clean
$diff = git diff 2>&1
$cached = git diff --cached 2>&1
if (-not $diff -and -not $cached) { exit 0 }

# Don't checkpoint on main — only on feature branches
$branch = git rev-parse --abbrev-ref HEAD 2>&1
if ($branch -eq "main" -or $branch -eq "master") {
    Write-Host "[commit-on-stop] On main branch — skipping checkpoint commit (branch discipline applies)"
    exit 0
}

$timestamp = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
git add -A 2>&1 | Out-Null
git commit -m "session checkpoint: $timestamp" 2>&1 | Out-Null
Write-Host "[commit-on-stop] Checkpointed at $timestamp on branch $branch"
