#!/bin/bash
# Kill-switch: halt all tool calls when AGENT_STOP sentinel file exists.
# Usage: touch AGENT_STOP   → halts immediately
#        rm AGENT_STOP      → resumes
# Adapted from anthropics/cwc-long-running-agents (Apache-2.0)
if [ -f "AGENT_STOP" ]; then
    echo '{"decision":"block","reason":"AGENT_STOP sentinel file found in project root. Remove it to resume the agent."}'
    exit 0
fi
echo '{"decision":"allow"}'
