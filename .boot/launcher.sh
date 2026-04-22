#!/bin/bash
# myhub launcher — final boot step before the TUI takes over.
# Derives MYHUB_ROOT from its own location so it works on any mount path
# (/Volumes/myhub, /Volumes/myhub 1, /Volumes/whatever-you-named-the-drive).
set -euo pipefail

MYHUB="$(cd "$(dirname "$0")/.." && pwd)"

# Point Claude Code at the SSD's config dir. All auth + settings live here,
# never on the host Keychain — that's the "SSD autark" guarantee.
export CLAUDE_CONFIG_DIR="$MYHUB/.claude"
export CLAUDE_CODE_PLUGIN_CACHE_DIR="$MYHUB/.claude/plugins"
export MYHUB_ROOT="$MYHUB"

# Prepend SSD-local tools to PATH. Order: bin (compiled binaries) first, then
# Go toolchain (build-time). Everything lives on the SSD — zero host deps.
export PATH="$MYHUB/bin:$MYHUB/tooling/go/bin:$PATH"

# Hand off to the TUI. If it's missing (e.g. fresh clone before first build),
# fall back to Claude Code directly so the user is never stranded.
TUI="$MYHUB/bin/myhub-tui"
if [[ -x "$TUI" ]]; then
    cd "$MYHUB"
    exec "$TUI" "$@"
fi

echo "myhub: TUI binary not found at $TUI"
echo "       Build it with:  (cd \"$MYHUB/myhub-tui\" && make build)"
echo "       Falling back to direct Claude Code session."
echo
cd "$MYHUB/content"
exec "$MYHUB/bin/claude" "$@"
