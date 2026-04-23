#!/bin/bash
# Installs a SSD-local `uv` binary into $MYHUB_ROOT/bin/uv for dependency
# management inside runtime/python's site-packages. Idempotent.
#
# uv is statically linked Rust — relocatable by nature, no codesign
# drama. We just fetch, extract, and drop two files into bin/.
set -euo pipefail

MYHUB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN_DIR="$MYHUB_ROOT/bin"
CACHE_DIR="$MYHUB_ROOT/tooling/cache"

case "$(uname -s)" in
    Darwin) ;;
    *) echo "install-uv.sh: unsupported OS $(uname -s) — macOS only"; exit 1 ;;
esac

case "$(uname -m)" in
    arm64)  UV_ARCH="aarch64-apple-darwin" ;;
    x86_64) UV_ARCH="x86_64-apple-darwin" ;;
    *) echo "install-uv.sh: unsupported arch $(uname -m)"; exit 1 ;;
esac

mkdir -p "$BIN_DIR" "$CACHE_DIR"

echo "→ Fetching latest uv release metadata…"
RELEASE_JSON="$(curl -fsSL https://api.github.com/repos/astral-sh/uv/releases/latest)"
ASSET_URL="$(
    printf '%s' "$RELEASE_JSON" \
        | grep -Eo '"browser_download_url":[[:space:]]*"[^"]+"' \
        | sed -E 's/.*"([^"]+)"$/\1/' \
        | grep -F "uv-${UV_ARCH}" \
        | grep -E '\.tar\.gz$' \
        | head -n1
)"

if [[ -z "${ASSET_URL:-}" ]]; then
    echo "install-uv.sh: no matching asset found for ${UV_ARCH}"
    exit 1
fi

TARBALL_NAME="$(basename "$ASSET_URL")"
TARBALL_PATH="$CACHE_DIR/$TARBALL_NAME"

if [[ ! -f "$TARBALL_PATH" ]]; then
    echo "→ Downloading ${TARBALL_NAME}…"
    curl -fsSL -o "$TARBALL_PATH.tmp" "$ASSET_URL"
    mv "$TARBALL_PATH.tmp" "$TARBALL_PATH"
else
    echo "→ Using cached $TARBALL_NAME"
fi

STAGING_DIR="$MYHUB_ROOT/tooling/cache/.stage-uv.$$"
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR"
tar -xzf "$TARBALL_PATH" -C "$STAGING_DIR"

# Archive contains uv-<arch>/uv and uv-<arch>/uvx.
INNER_DIR="$(find "$STAGING_DIR" -maxdepth 1 -mindepth 1 -type d | head -n1)"
if [[ -z "$INNER_DIR" ]]; then
    echo "install-uv.sh: unexpected archive layout"
    rm -rf "$STAGING_DIR"
    exit 1
fi

install -m 0755 "$INNER_DIR/uv"  "$BIN_DIR/uv"
install -m 0755 "$INNER_DIR/uvx" "$BIN_DIR/uvx"
rm -rf "$STAGING_DIR"

xattr -dr com.apple.quarantine "$BIN_DIR/uv" "$BIN_DIR/uvx" 2>/dev/null || true

VER="$("$BIN_DIR/uv" --version 2>&1)"
echo ""
echo "✓ $VER installed at $BIN_DIR/uv"
