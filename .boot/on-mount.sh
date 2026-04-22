#!/bin/bash
# Invoked by launchd on every SSD mount (StartOnMount=true).
# Orchestrates the Jarvis moment: sound, notification, preflight, Terminal.
set -euo pipefail

MYHUB="$(cd "$(dirname "$0")/.." && pwd)"
cd "$MYHUB"

# 1. Manifest verification — tamper check. Non-fatal: mismatch is logged and
#    surfaces as a notification, but we still boot so the user isn't stranded
#    (they may have intentionally edited scripts).
if [[ -x "$MYHUB/bin/myhub" && -f "$MYHUB/manifest.json" ]]; then
    if ! "$MYHUB/bin/myhub" verify >/tmp/myhub-mount-verify.log 2>&1; then
        osascript -e 'display notification "myhub: manifest mismatch — see /tmp/myhub-mount-verify.log" with title "myhub"' 2>/dev/null || true
    fi
fi

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
