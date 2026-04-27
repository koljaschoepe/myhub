#!/usr/bin/env bash
# Phase 5.3 — local Linux AppImage build for Arasul.
#
# Designed to run on Linux; for cross-compilation from macOS/Windows
# you'd run the release-arasul.yml CI which spins up an Ubuntu runner.
#
# Usage:  tooling/build-appimage.sh [--sign]
#
# If --sign is passed, the resulting AppImage is signed with the GPG key
# configured in `GPG_SIGN_KEY` (env var or git config user.signingkey).

set -euo pipefail

if [ "$(uname)" != "Linux" ]; then
  echo "this script runs on Linux. For cross-builds, see .github/workflows/release-arasul.yml" >&2
  exit 64
fi

SIGN=0
for arg in "$@"; do
  case "$arg" in
    --sign) SIGN=1 ;;
    *) echo "unknown arg: $arg" >&2; exit 64 ;;
  esac
done

cd "$(dirname "$0")/../arasul-app"

command -v pnpm >/dev/null || { echo "pnpm required"; exit 1; }
command -v cargo >/dev/null || { echo "cargo required — source ../tooling/activate-rust.sh first"; exit 1; }
command -v appimagetool >/dev/null || {
  echo "appimagetool required. Install:"
  echo "  wget -c https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage"
  echo "  chmod +x appimagetool-x86_64.AppImage && sudo mv appimagetool-x86_64.AppImage /usr/local/bin/appimagetool"
  exit 1
}

echo "→ installing frontend deps"
pnpm install --frozen-lockfile

echo "→ building Tauri bundle (release)"
pnpm tauri build --target x86_64-unknown-linux-gnu

TARGET_DIR="src-tauri/target/x86_64-unknown-linux-gnu/release"
APPIMAGE=$(find "$TARGET_DIR/bundle/appimage" -maxdepth 1 -name "*.AppImage" | head -n 1 || true)

if [ -z "${APPIMAGE:-}" ]; then
  echo "→ Tauri did not produce an AppImage — running appimagetool manually"
  STAGING=$(mktemp -d)
  APPDIR="$STAGING/Arasul.AppDir"
  mkdir -p "$APPDIR/usr/bin" "$APPDIR/usr/share/icons/hicolor/512x512/apps"
  cp "$TARGET_DIR/arasul-app" "$APPDIR/usr/bin/arasul"
  if [ -f ../arasul-app/src-tauri/icons/icon.png ]; then
    cp ../arasul-app/src-tauri/icons/icon.png "$APPDIR/usr/share/icons/hicolor/512x512/apps/arasul.png"
    cp ../arasul-app/src-tauri/icons/icon.png "$APPDIR/arasul.png"
  fi
  cat > "$APPDIR/arasul.desktop" <<EOF
[Desktop Entry]
Name=Arasul
Exec=arasul
Icon=arasul
Type=Application
Categories=Utility;Office;
EOF
  cat > "$APPDIR/AppRun" <<'EOF'
#!/bin/sh
HERE="$(dirname "$(readlink -f "$0")")"
exec "$HERE/usr/bin/arasul" "$@"
EOF
  chmod +x "$APPDIR/AppRun"
  APPIMAGE="$(pwd)/Arasul-$(cat src-tauri/Cargo.toml | awk -F'"' '/^version/ {print $2}').AppImage"
  appimagetool "$APPDIR" "$APPIMAGE"
fi

echo "→ built: $APPIMAGE"

if [ "$SIGN" = 1 ]; then
  KEY="${GPG_SIGN_KEY:-$(git config --get user.signingkey 2>/dev/null || true)}"
  if [ -z "$KEY" ]; then
    echo "--sign requested but no GPG key configured. Set GPG_SIGN_KEY or git config user.signingkey." >&2
    exit 1
  fi
  echo "→ signing with key $KEY"
  gpg --batch --yes --local-user "$KEY" --detach-sign "$APPIMAGE"
  echo "→ signature: $APPIMAGE.sig"
fi

echo "✓ done"
