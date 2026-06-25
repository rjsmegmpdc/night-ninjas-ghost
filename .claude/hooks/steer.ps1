# Steer: inject one-shot operator instruction mid-run.
# Usage: Set-Content STEER.md "Your instruction here"
# The agent receives it once, then STEER.md is cleared.
# Adapted from anthropics/cwc-long-running-agents (Apache-2.0)
if ((Test-Path "STEER.md") -and ((Get-Content "STEER.md" -Raw -ErrorAction SilentlyContinue).Trim() -ne "")) {
    $content = (Get-Content "STEER.md" -Raw).Trim()
    Set-Content "STEER.md" ""
    $escaped = $content -replace '\\', '\\\\' -replace '"', '\"'
    Write-Output "{`"decision`":`"block`",`"reason`":`"OPERATOR STEERING: $escaped`"}"
    exit 0
}
Write-Output '{"decision":"allow"}'
