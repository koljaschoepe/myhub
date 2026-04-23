#!/bin/bash
# Sanity-check the SSD before the TUI takes over.
# Exits 0 on clean, 1 on any critical issue. The TUI renders details itself,
# so stderr/stdout here is mostly for debugging via /tmp/com.myhub.mount.err.
set -u

MYHUB="$(cd "$(dirname "$0")/.." && pwd)"
STATUS=0

check() {
    local label="$1"; shift
    if "$@" >/dev/null 2>&1; then
        echo "  ✓ $label"
    else
        echo "  ✗ $label"
        STATUS=1
    fi
}

warn() {
    local label="$1"; shift
    if "$@" >/dev/null 2>&1; then
        echo "  ✓ $label"
    else
        echo "  ~ $label (warning only)"
    fi
}

echo "myhub preflight — $MYHUB"

check "Claude Code binary present"     test -x "$MYHUB/bin/claude"
check ".claude/ config dir readable"   test -r "$MYHUB/.claude"
check "content/ dir exists"            test -d "$MYHUB/content"
check "memory/ dir exists"             test -d "$MYHUB/memory"

warn  "TUI launcher present"           test -x "$MYHUB/bin/myhub-tui"
warn  "Python runtime present"         test -x "$MYHUB/runtime/python/bin/python3"
warn  "TUI package importable"         test -f "$MYHUB/myhub-tui/myhub_tui/app.py"
warn  "content/CLAUDE.md root map"     test -f "$MYHUB/content/CLAUDE.md"
warn  "memory/MEMORY.md index"         test -f "$MYHUB/memory/MEMORY.md"

exit $STATUS
