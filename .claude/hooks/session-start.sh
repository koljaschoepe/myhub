#!/bin/bash
# Claude Code SessionStart hook.
# Slimmed in v2: greeting/TTS moved to the TUI. Only job here is to surface
# project-local memory when MYHUB_PROJECT is set by the TUI's launcher.
set -euo pipefail

: "${MYHUB_ROOT:=}"
: "${MYHUB_PROJECT:=}"

# Bail silently if env is not set (e.g. claude invoked outside myhub).
[[ -z "$MYHUB_ROOT" || -z "$MYHUB_PROJECT" ]] && exit 0

MEM_DIR="$MYHUB_ROOT/memory/projects/$MYHUB_PROJECT"
[[ -d "$MEM_DIR" ]] || exit 0

# Emit a compact "project context" block that Claude's SessionStart hook
# injects into the session.
echo "## Project memory — $MYHUB_PROJECT"
echo
find "$MEM_DIR" -name '*.md' -print0 2>/dev/null \
    | xargs -0 -I{} sh -c 'echo "### $1"; cat "$1"; echo' _ {}
