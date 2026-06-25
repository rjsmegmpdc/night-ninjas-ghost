# Kill-switch: halt all tool calls when AGENT_STOP sentinel file exists.
# Usage: New-Item AGENT_STOP   → halts immediately
#        Remove-Item AGENT_STOP → resumes
# Adapted from anthropics/cwc-long-running-agents (Apache-2.0)
if (Test-Path "AGENT_STOP") {
    Write-Output '{"decision":"block","reason":"AGENT_STOP sentinel file found in project root. Remove it to resume the agent."}'
    exit 0
}
Write-Output '{"decision":"allow"}'
