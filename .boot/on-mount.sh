#!/bin/bash
# Invoked by ~/.myhub-mount-wrapper.sh in the background (Phase B onwards).
# Side-effects only: manifest check, sound, notification, preflight.
# The Tauri app is opened by the wrapper, NOT this script — so this script
# must return promptly so the GUI isn't blocked.
set -euo pipefail

MYHUB="$(cd "$(dirname "$0")/.." && pwd)"
cd "$MYHUB"

# 1. Manifest verification — tamper check. Non-fatal: mismatch is logged and
#    surfaces as a notification, but we still return so the GUI proceeds.
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

# 4. Preflight — logs issues but never blocks. App surfaces details itself.
"$MYHUB/.boot/preflight.sh" || true

exit 0
