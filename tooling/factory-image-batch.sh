#!/usr/bin/env bash
# Phase 8.3 — bulk-image N drives in a factory run.
#
# For the SKU A preloaded-SSD line: plug up to 16 drives into a USB-C hub,
# pass all their device paths, and this iterates through them sequentially
# (parallel imaging hits exFAT write contention on consumer USB hubs).
#
# Usage:  tooling/factory-image-batch.sh /dev/disk4 /dev/disk5 /dev/disk6 …
#
# Generates a per-batch manifest.csv with: device, label, version, sha256,
# ok/fail. Check the manifest into Git for a production run (audit trail).

set -euo pipefail

if [ $# -eq 0 ]; then
  echo "usage: $0 <device> [<device> ...]"
  exit 64
fi

BATCH_ID="$(date +%Y%m%d-%H%M%S)"
MANIFEST="factory-batch-$BATCH_ID.csv"
echo "device,label,version,sha256,status,error" > "$MANIFEST"

bold()  { printf "\033[1m%s\033[0m\n" "$*"; }

for DEV in "$@"; do
  bold "=== imaging $DEV ==="
  LABEL="Arasul-$(uuidgen | head -c 4 | tr '[:upper:]' '[:lower:]')"
  if ARASUL_LABEL="$LABEL" ./tooling/image-ssd.sh "$DEV"; then
    SHA=$(shasum -a 256 "/Volumes/$LABEL/README.txt" 2>/dev/null | awk '{print $1}' || echo "")
    VERSION=$(awk -F'"' '/^version/ {print $2}' "/Volumes/$LABEL/memory/config.toml" 2>/dev/null || echo "unknown")
    echo "$DEV,$LABEL,$VERSION,$SHA,ok," >> "$MANIFEST"
  else
    echo "$DEV,$LABEL,,,fail,image-ssd.sh exit $?" >> "$MANIFEST"
  fi
done

bold "→ manifest written to $MANIFEST"
cat "$MANIFEST"
