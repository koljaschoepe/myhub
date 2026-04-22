#!/bin/bash
# Claude Code SessionEnd hook.
# Two jobs: (1) kick off the wiki compiler if content/ changed, (2) bump
# last_opened_at in memory/projects.yaml for the project we just left.
set -euo pipefail

: "${MYHUB_ROOT:=}"
: "${MYHUB_PROJECT:=}"

# Bail if not in a myhub-launched session.
[[ -z "$MYHUB_ROOT" ]] && exit 0

# 1. Incremental compile in the background. Compiler is idempotent on no-change.
if [[ -x "$MYHUB_ROOT/bin/claude" ]]; then
    (
        "$MYHUB_ROOT/bin/claude" -p --agent compiler "run incremental compile" \
            >"$MYHUB_ROOT/memory/sessions/last-compile.log" 2>&1 &
    ) || true
fi

# 2. Update last_opened_at in the project registry.
if [[ -n "$MYHUB_PROJECT" && -f "$MYHUB_ROOT/memory/projects.yaml" ]]; then
    now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    python3 - "$MYHUB_ROOT/memory/projects.yaml" "$MYHUB_PROJECT" "$now" <<'PY' 2>/dev/null || true
import sys, os
try:
    import yaml
except ImportError:
    sys.exit(0)
path, project, now = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path) as f:
    d = yaml.safe_load(f) or {}
for p in d.get("projects", []):
    if p.get("name") == project:
        p["last_opened_at"] = now
        break
tmp = path + ".tmp"
with open(tmp, "w") as f:
    yaml.safe_dump(d, f, default_flow_style=False, sort_keys=False)
os.replace(tmp, path)
PY
fi

exit 0
