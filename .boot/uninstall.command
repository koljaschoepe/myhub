#!/bin/bash
# Remove the myhub launchd LaunchAgent from this Mac.
# Does NOT touch the SSD contents or user data.
set -euo pipefail

PLIST_DST="$HOME/Library/LaunchAgents/com.myhub.mount.plist"

cat <<EOF
myhub uninstaller
=================
About to remove: $PLIST_DST
(SSD contents untouched. User data untouched. No Keychain entries to clear.)
EOF

read -r -p "Continue? [y/N] " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || { echo "aborted."; exit 1; }

launchctl bootout "gui/$(id -u)/com.myhub.mount" 2>/dev/null || true
rm -f "$PLIST_DST"
rm -f "$HOME/.myhub-mount-wrapper.sh"

echo "✓ myhub LaunchAgent removed. You may unplug the SSD safely."
