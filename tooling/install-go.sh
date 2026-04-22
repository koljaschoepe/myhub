#!/bin/bash
# Bootstrap Go toolchain onto the SSD under tooling/go/.
# Idempotent: re-running skips if the target version already exists.
set -euo pipefail

GO_VERSION="1.26.2"
GO_ARCH="darwin-arm64"
GO_SHA256="32af1522bf3e3ff3975864780a429cc0b41d190ec7bf90faa661d6d64566e7af"
GO_URL="https://go.dev/dl/go${GO_VERSION}.${GO_ARCH}.tar.gz"

TOOLING="$(cd "$(dirname "$0")" && pwd)"
TARGET="$TOOLING/go-$GO_VERSION"
TARBALL="$TOOLING/go${GO_VERSION}.${GO_ARCH}.tar.gz"

if [[ -d "$TARGET" && -x "$TARGET/bin/go" ]]; then
    echo "✓ Go $GO_VERSION already installed at $TARGET"
else
    echo "Downloading Go $GO_VERSION for $GO_ARCH..."
    curl -sSL -o "$TARBALL" "$GO_URL"

    echo "Verifying SHA-256..."
    echo "$GO_SHA256  $TARBALL" | shasum -a 256 -c -

    echo "Extracting to $TARGET..."
    mkdir -p "$TARGET"
    tar -xzf "$TARBALL" -C "$TOOLING"
    # Go's tarball extracts as ./go/; rename to versioned dir.
    mv "$TOOLING/go" "$TARGET-new" 2>/dev/null || true
    if [[ -d "$TARGET-new" ]]; then
        rm -rf "$TARGET"
        mv "$TARGET-new" "$TARGET"
    fi
    rm -f "$TARBALL"
fi

# Flip symlink to this version.
ln -sfn "go-$GO_VERSION" "$TOOLING/go"

echo
echo "Active Go:"
"$TOOLING/go/bin/go" version
echo
echo "To use: export PATH=\"$TOOLING/go/bin:\$PATH\""
echo "(The myhub launcher does this automatically.)"
