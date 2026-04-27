#!/usr/bin/env bash
# Phase 5.6 — turn a blank USB-C SSD into a factory-Arasul drive.
#
# Workflow:
#   1. Format the target drive as exFAT, label "Arasul"
#   2. Fetch the latest release tarballs per-OS from the release feed
#   3. Extract the three binaries + assets to the drive root
#   4. Run the postinstall wizard helper
#
# Usage:  tooling/image-ssd.sh <device>
#         e.g.  tooling/image-ssd.sh /dev/disk4
#
# This is the single-device interactive version; Phase 8 bulk imaging
# wraps this loop across N drives for factory runs.

set -euo pipefail

DEVICE="${1:-}"
if [ -z "$DEVICE" ]; then
  echo "usage: $0 <device>"
  echo "on macOS: diskutil list — pick the target USB-C SSD"
  exit 64
fi

GH_API="${ARASUL_GH_API:-https://api.github.com/repos/arasul/arasul/releases/latest}"
LABEL="${ARASUL_LABEL:-Arasul}"
MOUNT_BASE="${ARASUL_MOUNT_BASE:-/Volumes}"

bold()  { printf "\033[1m%s\033[0m\n" "$*"; }
warn()  { printf "\033[33m%s\033[0m\n" "$*" >&2; }
die()   { printf "\033[31merror:\033[0m %s\n" "$*" >&2; exit 1; }

bold "→ imaging $DEVICE as $LABEL"

case "$(uname)" in
  Darwin)
    diskutil info "$DEVICE" > /dev/null || die "not a valid disk on macOS"
    warn "about to ERASE $DEVICE — all data will be lost. Ctrl-C in the next 10 seconds to abort."
    for i in 10 9 8 7 6 5 4 3 2 1; do printf "\r%s " "$i"; sleep 1; done; echo
    diskutil eraseDisk ExFAT "$LABEL" MBR "$DEVICE"
    MOUNT="$MOUNT_BASE/$LABEL"
    ;;
  Linux)
    command -v mkfs.exfat >/dev/null || die "install exfatprogs: apt install exfatprogs"
    warn "about to ERASE $DEVICE — all data will be lost. Ctrl-C in the next 10 seconds to abort."
    for i in 10 9 8 7 6 5 4 3 2 1; do printf "\r%s " "$i"; sleep 1; done; echo
    wipefs -a "$DEVICE"
    parted -s "$DEVICE" mklabel msdos mkpart primary 1MiB 100%
    PART="${DEVICE}1"
    mkfs.exfat -n "$LABEL" "$PART"
    MOUNT="/mnt/$LABEL"
    mkdir -p "$MOUNT"
    mount "$PART" "$MOUNT"
    ;;
  *)
    die "run this on macOS or Linux. Windows: use Rufus GUI + a separate PowerShell script."
    ;;
esac

bold "→ drive mounted at $MOUNT"

# Fetch + verify the latest release from GitHub.
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
bold "→ fetching latest GitHub release"
curl -fsSL -H "Accept: application/vnd.github+json" "$GH_API" -o "$TMP/release.json"

VERSION=$(node -e "const r=JSON.parse(require('fs').readFileSync('$TMP/release.json','utf8')); console.log(r.tag_name.replace(/^arasul-v/, ''))")
bold "   version: $VERSION"

# Fetch all per-OS assets attached to the release.
node -e "
  const r = JSON.parse(require('fs').readFileSync('$TMP/release.json', 'utf8'));
  for (const a of r.assets || []) {
    console.log(a.browser_download_url);
  }
" > "$TMP/asset-urls.txt"

if [ ! -s "$TMP/asset-urls.txt" ]; then
  die "no assets attached to the latest release — release not ready?"
fi

while read -r URL; do
  [ -z "$URL" ] && continue
  NAME="$(basename "$URL")"
  bold "→ fetching $NAME"
  curl -fsSL -o "$TMP/$NAME" "$URL"
done < "$TMP/asset-urls.txt"

# Lay out the drive.
#   /Arasul/
#     Arasul.app/     (macOS double-click)
#     Arasul.exe      (Windows double-click)
#     Arasul.AppImage (Linux double-click)
#     bin/            (claude + arasul-cli per-OS)
#     .boot/          (vault.enc comes into being on first unlock)
#     content/        (user's notes/projects — starts empty)
#     memory/         (starts empty with a stub config.toml)
#     README.txt      (plug-and-play instructions for the end user)

mkdir -p "$MOUNT/bin" "$MOUNT/content/notes" "$MOUNT/content/projects" "$MOUNT/memory"

# Extract bundles: in production Tauri ships DMG/MSI/AppImage — for v1
# factory imaging we also ship a pre-extracted tree per-OS so end users
# don't have to run installers. This is Phase 5.7 work; here we assume
# the feed has already flat-packed them.
for bundle in "$TMP"/*.dmg "$TMP"/*.AppImage "$TMP"/*.msi "$TMP"/*.exe; do
  [ -e "$bundle" ] || continue
  bold "→ staging $(basename "$bundle")"
  cp "$bundle" "$MOUNT/"
done

# Starter content.
cat > "$MOUNT/README.txt" <<'EOF'
Arasul — your portable AI workspace.

macOS:   double-click Arasul.app
Windows: double-click Arasul.exe
Linux:   double-click Arasul.AppImage

On first plug-in Arasul asks you for a passphrase. Write it down somewhere
safe — losing it means you'll have to sign in to Claude again, but your
notes and projects are never lost.

Support: arasul.dev/support
EOF

cat > "$MOUNT/memory/config.toml" <<EOF
# Arasul configuration — edit carefully. Re-runs of the app read this file.
# Changes are merged with any unknown keys preserved.

version = "$VERSION"
drive_label = "$LABEL"
EOF

cat > "$MOUNT/memory/projects.yaml" <<'EOF'
projects: []
EOF

bold "✓ $MOUNT is a factory-Arasul drive."
bold "  Eject (on macOS: diskutil eject $DEVICE) and plug into a test machine."
