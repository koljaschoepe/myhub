#!/bin/bash
# One-time-per-Mac installer. Double-click from Finder to run.
# Registers a launchd LaunchAgent that fires on SSD mount.
set -euo pipefail

MYHUB="$(cd "$(dirname "$0")/.." && pwd)"
PLIST_SRC="$MYHUB/.boot/plist.template"
PLIST_DST="$HOME/Library/LaunchAgents/com.myhub.mount.plist"
VOL_LABEL="$(basename "$MYHUB")"
MAC_UUID="$(ioreg -rd1 -c IOPlatformExpertDevice | awk -F\" '/IOPlatformUUID/{print $(NF-1)}')"
HOSTS_JSON="$MYHUB/.boot/trusted-hosts.json"

cat <<EOF
myhub installer
===============
SSD path:                $MYHUB
Volume label:            $VOL_LABEL
This Mac's hardware UUID: $MAC_UUID
LaunchAgent destination: $PLIST_DST

About to:
  1. Install a launchd LaunchAgent that runs $MYHUB/.boot/on-mount.sh on every
     mount of "$VOL_LABEL".
  2. Register this Mac's UUID in $HOSTS_JSON.
  3. Run on-mount.sh immediately (first-mount simulation).

The SSD contents and this Mac's Keychain are not touched.
EOF

read -r -p "Continue? [y/N] " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || { echo "aborted."; exit 1; }

# --- 1. Install LaunchAgent ---
mkdir -p "$(dirname "$PLIST_DST")"
sed -e "s|__MYHUB_PATH__|$MYHUB|g" -e "s|__MYHUB_VOL__|$VOL_LABEL|g" "$PLIST_SRC" > "$PLIST_DST"
chmod 0644 "$PLIST_DST"

# Bootstrap into the user's launchd domain. `bootout` first is harmless if not loaded.
launchctl bootout "gui/$(id -u)/com.myhub.mount" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"
launchctl enable "gui/$(id -u)/com.myhub.mount" 2>/dev/null || true

# --- 2. Register trusted-hosts ---
if [[ ! -f "$HOSTS_JSON" ]]; then
    echo '{"hosts":[]}' > "$HOSTS_JSON"
fi
if ! grep -q "\"$MAC_UUID\"" "$HOSTS_JSON"; then
    python3 - "$HOSTS_JSON" "$MAC_UUID" <<'PY'
import json, sys, datetime
path, uuid = sys.argv[1], sys.argv[2]
with open(path) as f: d = json.load(f)
d.setdefault("hosts", []).append({
    "uuid": uuid,
    "installed_at": datetime.datetime.utcnow().isoformat(timespec="seconds") + "Z",
})
with open(path, "w") as f: json.dump(d, f, indent=2)
PY
fi

# --- 3. Simulate a first mount ---
echo
echo "Running on-mount.sh now (first-mount simulation)..."
"$MYHUB/.boot/on-mount.sh"

echo
echo "✓ myhub installed. Future mounts of '$VOL_LABEL' will trigger automatically."
echo "  To remove: $MYHUB/.boot/uninstall.command"
