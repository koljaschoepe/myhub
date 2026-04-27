#!/bin/bash
# Bootstraps a SSD-portable Rust toolchain under $MYHUB_ROOT/runtime/rust/.
# Mirrors install-python.sh and install-go.sh - toolchain lives on the SSD,
# host has zero footprint.
#
# After install, run `source tooling/activate-rust.sh` (or set RUSTUP_HOME,
# CARGO_HOME, PATH manually) to make cargo/rustc/rustup resolvable.
#
# Idempotent - re-running updates the stable toolchain in place.
set -euo pipefail

MYHUB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUSTUP_HOME="${MYHUB_ROOT}/runtime/rust/rustup"
CARGO_HOME="${MYHUB_ROOT}/runtime/rust/cargo"
CACHE_DIR="${MYHUB_ROOT}/tooling/cache"

case "$(uname -s)" in
    Darwin) ;;
    *) echo "install-rust.sh: unsupported OS $(uname -s) - macOS only for now"; exit 1 ;;
esac

case "$(uname -m)" in
    arm64)  RUSTUP_ARCH="aarch64-apple-darwin" ;;
    x86_64) RUSTUP_ARCH="x86_64-apple-darwin" ;;
    *) echo "install-rust.sh: unsupported arch $(uname -m)"; exit 1 ;;
esac

mkdir -p "${RUSTUP_HOME}" "${CARGO_HOME}" "${CACHE_DIR}"

RUSTUP_INIT="${CACHE_DIR}/rustup-init-${RUSTUP_ARCH}"

if [[ ! -x "${RUSTUP_INIT}" ]]; then
    echo "-> Downloading rustup-init for ${RUSTUP_ARCH}..."
    curl -fsSL -o "${RUSTUP_INIT}.tmp" \
        "https://static.rust-lang.org/rustup/dist/${RUSTUP_ARCH}/rustup-init"
    chmod +x "${RUSTUP_INIT}.tmp"
    mv "${RUSTUP_INIT}.tmp" "${RUSTUP_INIT}"
else
    echo "-> Using cached $(basename "${RUSTUP_INIT}")"
fi

echo "-> Installing Rust stable toolchain into ${RUSTUP_HOME}..."
export RUSTUP_HOME CARGO_HOME
"${RUSTUP_INIT}" -y --default-toolchain stable --profile minimal --no-modify-path

echo "-> Adding cross-compile targets (mac arm64 + x86_64)..."
"${CARGO_HOME}/bin/rustup" target add aarch64-apple-darwin x86_64-apple-darwin

echo "-> Installing tauri-cli v2 (cargo install, compiles from source, ~3-5 min)..."
"${CARGO_HOME}/bin/cargo" install tauri-cli@^2 --locked

xattr -dr com.apple.quarantine "${RUSTUP_HOME}" "${CARGO_HOME}" 2>/dev/null || true

VER_RUSTC="$("${CARGO_HOME}/bin/rustc" --version 2>&1)"
VER_CARGO="$("${CARGO_HOME}/bin/cargo" --version 2>&1)"
VER_TAURI="$("${CARGO_HOME}/bin/cargo" tauri --version 2>&1 | head -n1 || echo 'tauri-cli not resolvable yet')"

echo ""
echo "OK ${VER_RUSTC}"
echo "OK ${VER_CARGO}"
echo "OK ${VER_TAURI}"
echo ""
echo "To use in this shell:"
echo "    source ${MYHUB_ROOT}/tooling/activate-rust.sh"
