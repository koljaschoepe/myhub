#!/bin/bash
# Bootstraps a SSD-portable Python runtime from python-build-standalone
# (Astral) into $MYHUB_ROOT/runtime/python/. Idempotent — re-running
# replaces the existing runtime atomically.
#
# The install_only tarballs from python-build-standalone are already
# ad-hoc codesigned and relocatable (@executable_path-relative dylib
# paths) as of their 2024-10-16 release, so no extra patching is needed
# for macOS — we just strip the Gatekeeper quarantine xattr and re-sign
# defensively (idempotent on already-signed binaries).
#
# Docs: https://gregoryszorc.com/docs/python-build-standalone/main/
set -euo pipefail

MYHUB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUNTIME_DIR="$MYHUB_ROOT/runtime/python"
CACHE_DIR="$MYHUB_ROOT/tooling/cache"
PYTHON_VERSION="${PYTHON_VERSION:-3.13}"

case "$(uname -s)" in
    Darwin) ;;
    *) echo "install-python.sh: unsupported OS $(uname -s) — macOS only"; exit 1 ;;
esac

case "$(uname -m)" in
    arm64)  PBS_ARCH="aarch64-apple-darwin" ;;
    x86_64) PBS_ARCH="x86_64-apple-darwin" ;;
    *) echo "install-python.sh: unsupported arch $(uname -m)"; exit 1 ;;
esac

mkdir -p "$CACHE_DIR"

# Resolve the matching install_only asset from the latest
# python-build-standalone release. We parse with grep+sed to avoid a
# jq dependency (SSD must remain tooling-light on first bootstrap).
echo "→ Fetching latest python-build-standalone release metadata…"
RELEASE_JSON="$(curl -fsSL https://api.github.com/repos/astral-sh/python-build-standalone/releases/latest)"
ASSET_URL="$(
    printf '%s' "$RELEASE_JSON" \
        | grep -Eo '"browser_download_url":[[:space:]]*"[^"]+"' \
        | sed -E 's/.*"([^"]+)"$/\1/' \
        | grep -F "cpython-${PYTHON_VERSION}" \
        | grep -F "${PBS_ARCH}" \
        | grep -v 'freethreaded' \
        | grep -v 'debug' \
        | grep -v 'pgo' \
        | grep -E '\-install_only\.tar\.gz$' \
        | head -n1
)"

if [[ -z "${ASSET_URL:-}" ]]; then
    echo "install-python.sh: no matching asset found for Python ${PYTHON_VERSION} / ${PBS_ARCH}"
    exit 1
fi

TARBALL_NAME="$(basename "$ASSET_URL")"
TARBALL_PATH="$CACHE_DIR/$TARBALL_NAME"

if [[ ! -f "$TARBALL_PATH" ]]; then
    echo "→ Downloading $TARBALL_NAME (~30 MB)…"
    curl -fsSL -o "$TARBALL_PATH.tmp" "$ASSET_URL"
    mv "$TARBALL_PATH.tmp" "$TARBALL_PATH"
else
    echo "→ Using cached $TARBALL_NAME"
fi

# Replace runtime atomically-ish: extract to a sibling, then swap.
STAGING_DIR="$MYHUB_ROOT/runtime/.stage.$$"
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR"
tar -xzf "$TARBALL_PATH" -C "$STAGING_DIR"
# install_only tarballs extract to a top-level `python/` directory.
if [[ ! -d "$STAGING_DIR/python" ]]; then
    echo "install-python.sh: unexpected tarball layout (no python/ root)"
    rm -rf "$STAGING_DIR"
    exit 1
fi

rm -rf "$RUNTIME_DIR"
mkdir -p "$(dirname "$RUNTIME_DIR")"
mv "$STAGING_DIR/python" "$RUNTIME_DIR"
rm -rf "$STAGING_DIR"

# Gatekeeper: strip any quarantine flag. curl-fetched files on
# macOS 15+ may be tagged even in the terminal.
xattr -dr com.apple.quarantine "$RUNTIME_DIR" 2>/dev/null || true

# Ad-hoc re-sign every Mach-O object. The tarball ships signed, but
# re-signing is idempotent and protects against file-move-side-effects
# that sometimes invalidate signatures.
echo "→ Ad-hoc codesigning Mach-O binaries…"
find "$RUNTIME_DIR" \( -name '*.dylib' -o -name '*.so' -o -name 'python3' -o -name 'python3.*' \) \
    -type f \
    -exec codesign --force --sign - {} + 2>/dev/null || true

VER="$("$RUNTIME_DIR/bin/python3" --version 2>&1)"
echo ""
echo "✓ $VER installed at $RUNTIME_DIR"
echo "  Launcher: $MYHUB_ROOT/bin/myhub-tui"
