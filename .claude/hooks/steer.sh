#!/bin/bash
# Steer: inject one-shot operator instruction mid-run.
# Usage: echo "Your instruction here" > STEER.md
# The agent receives it once, then STEER.md is cleared.
# Adapted from anthropics/cwc-long-running-agents (Apache-2.0)
if [ -f "STEER.md" ] && [ -s "STEER.md" ]; then
    CONTENT=$(cat STEER.md)
    # Clear immediately so it fires only once
    > STEER.md
    # Escape for JSON
    ESCAPED=$(echo "$CONTENT" | python3 -c "import json,sys; print(json.dumps(sys.stdin.read().strip()))" 2>/dev/null || echo "\"$CONTENT\"")
    echo "{\"decision\":\"block\",\"reason\":\"OPERATOR STEERING: $CONTENT\"}"
    exit 0
fi
echo '{"decision":"allow"}'
