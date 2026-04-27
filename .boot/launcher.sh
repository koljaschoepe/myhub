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
# Go toolchain (build-time), then the user's local install dir (where the
# official `claude` installer drops the binary). Everything else lives on the
# SSD — zero host deps. ~/.local/bin is added because Phase 4 of the master
# plan replaced bundled `bin/claude` with on-demand installation via Anthropic's
# official curl-installer; that installer writes to ~/.local/bin.
export PATH="$MYHUB/bin:$MYHUB/tooling/go/bin:$HOME/.local/bin:$PATH"

TUI="$MYHUB/bin/myhub-tui"
PYTHON_RUNTIME="$MYHUB/runtime/python/bin/python3"

# resolve_claude — find the official `claude` CLI on PATH (or in standard
# install locations the official installer uses). We never bundle the binary;
# it's proprietary ("All rights reserved") and would be a license violation
# to redistribute.
resolve_claude() {
    if command -v claude >/dev/null 2>&1; then
        command -v claude
        return 0
    fi
    for candidate in "$HOME/.local/bin/claude" /usr/local/bin/claude /opt/homebrew/bin/claude; do
        if [[ -x "$candidate" ]]; then
            echo "$candidate"
            return 0
        fi
    done
    return 1
}

# fallback_to_claude is the safety net: whenever the TUI can't run (missing,
# broken, Python runtime absent, or crashing repeatedly), we still try to give
# the user a usable session by exec'ing Claude Code directly in content/.
# If `claude` isn't installed either, we print install instructions and exit
# rather than leaving the user on a blank terminal.
fallback_to_claude() {
    local reason="$1"
    echo "" >&2
    echo "myhub: $reason" >&2
    echo "       Bootstrap / repair hint:" >&2
    echo "         bash \"$MYHUB/tooling/install-python.sh\"" >&2
    echo "         bash \"$MYHUB/tooling/install-uv.sh\"" >&2
    echo "         $MYHUB/bin/uv pip install --python \"$PYTHON_RUNTIME\" rich prompt-toolkit psutil PyYAML" >&2
    echo "" >&2
    if claude_bin="$(resolve_claude)"; then
        echo "       Falling back to direct Claude Code session ($claude_bin)." >&2
        echo "" >&2
        cd "$MYHUB/content"
        exec "$claude_bin" "$@"
    else
        echo "       Claude Code is not installed on this machine." >&2
        echo "       Install it once with Anthropic's official installer:" >&2
        echo "" >&2
        echo "         curl -fsSL https://claude.ai/install.sh | bash    # macOS / Linux / WSL" >&2
        echo "         irm https://claude.ai/install.ps1 | iex            # Windows PowerShell" >&2
        echo "" >&2
        echo "       Then plug the drive in again. (The Arasul GUI does this for you" >&2
        echo "       inside the Onboarding wizard — no terminal needed.)" >&2
        exit 1
    fi
}

if [[ ! -x "$TUI" ]]; then
    fallback_to_claude "TUI launcher not found at $TUI"
fi
if [[ ! -x "$PYTHON_RUNTIME" ]]; then
    fallback_to_claude "Python runtime missing at $PYTHON_RUNTIME"
fi

# Re-spawn loop. When the TUI hands the TTY to a child (claude, lazygit)
# via os.execvp, the child inherits launcher.sh as its parent. On child
# exit, we see .boot/.respawn if the TUI requested a restart; otherwise
# the user quit cleanly (/quit, Ctrl-C, Ctrl-D) and we break.
#
# Rate-limit: if the TUI crashes repeatedly within 10s, abort to the Claude
# fallback so a broken TUI can never CPU-spin. MAX_RESTARTS is per 10-second
# window; each "normal" exit (with marker) resets nothing — only crashes
# without a marker count as bad.
MARKER="$MYHUB/.boot/.respawn"
MAX_RESTARTS=5
cd "$MYHUB"

crash_count=0
window_start=$SECONDS
while true; do
    rm -f "$MARKER"
    start_ts=$SECONDS
    "$TUI" "$@" || true
    exit_ts=$SECONDS

    if [[ -f "$MARKER" ]]; then
        # Intentional respawn after /claude or /lazygit exit.
        crash_count=0
        continue
    fi

    # No marker = user quit normally OR the TUI crashed.
    # If the TUI ran for ≥3s, treat it as a clean quit and exit.
    if (( exit_ts - start_ts >= 3 )); then
        break
    fi

    # Short-lived child + no marker = crash. Count it.
    if (( exit_ts - window_start > 10 )); then
        crash_count=0
        window_start=$exit_ts
    fi
    crash_count=$((crash_count + 1))
    if (( crash_count >= MAX_RESTARTS )); then
        fallback_to_claude "TUI crashed $crash_count× in <10s — aborting the respawn loop."
    fi
    sleep 1
done
rm -f "$MARKER"
