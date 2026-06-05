#!/usr/bin/env bash
# PreToolUse(Bash) guard for the Koin project.
#
# Hard stop: refuse any Bash command that WRITES TO or DELETES the real Koin data
# directory (~/.koin). This is the user's live financial data and must never be
# touched by automation. Reads (cat/ls/grep/stat) are allowed. Test/automation runs
# should point KOIN_DATA_DIR at a sandbox instead (see .claude/settings.json).
#
# Reads the PreToolUse JSON on stdin, emits a PreToolUse "deny" decision when matched.
exec python3 -c '
import sys, json, re
try:
    cmd = json.load(sys.stdin).get("tool_input", {}).get("command", "")
except Exception:
    sys.exit(0)  # cannot parse -> do not block

# References the real data dir? (".koin" with the leading dot; a KOIN_DATA_DIR
# sandbox like /tmp/koin-claude-sandbox has no ".koin" substring, so it is unaffected.)
refers = re.search(r"\.koin(\b|/)", cmd) is not None

# A write/delete operation (not a read)?
destructive = re.search(
    r"(\brm\b|\bmv\b|\bcp\b|\btee\b|\btruncate\b|\bdd\b|\bln\b|sed\s+-i|>>?|open\([^)]*[\x27\x22][wa])",
    cmd,
) is not None

if refers and destructive:
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": (
            "Blocked by Koin safeguard: this command writes to or deletes the real Koin "
            "data directory (~/.koin), which holds the users live financial data. For tests, "
            "run the server with KOIN_DATA_DIR pointing at a sandbox; for a real change to "
            "~/.koin, ask the user to run it themselves."
        ),
    }}))
'
