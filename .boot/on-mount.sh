#!/bin/bash
# Invoked by launchd on every SSD mount (StartOnMount=true).
# Orchestrates the Jarvis moment: sound, notification, preflight, Terminal.
set -euo pipefail

MYHUB="$(cd "$(dirname "$0")/.." && pwd)"
cd "$MYHUB"

# 1. Manifest verification (Phase 4 will make this hard-fail on mismatch).
# "$MYHUB/.boot/verify-manifest.sh" || { echo "myhub: manifest mismatch"; exit 1; }

# 2. Boot sound.
SOUND="$MYHUB/.boot/assets/connect.aiff"
[[ -f "$SOUND" ]] && afplay "$SOUND" &

# 3. Notification.
osascript -e 'display notification "myhub connected" with title "myhub"' 2>/dev/null || true

# 4. Preflight — logs issues but never blocks the TUI (TUI renders details itself).
"$MYHUB/.boot/preflight.sh" || true

# 5. Open a new Terminal window running the launcher.
#    AppleScript's `do script` always opens a new window, which is what we want.
osascript <<APPLESCRIPT
tell application "Terminal"
    activate
    do script "cd '$MYHUB' && ./.boot/launcher.sh"
end tell
APPLESCRIPT
