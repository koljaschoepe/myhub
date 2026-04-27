# Source me to use the SSD-hosted Rust toolchain in this shell.
# Usage: source /path/to/ssd/tooling/activate-rust.sh
#
# Sets RUSTUP_HOME, CARGO_HOME, and prepends cargo's bin/ to PATH so that
# `cargo`, `rustc`, `rustup`, and `cargo tauri` all resolve to the SSD
# installation written by tooling/install-rust.sh.
#
# Safe to source multiple times (idempotent; duplicate PATH entries skipped).

# Resolve the SSD root from this script's location. BASH_SOURCE works in bash;
# fall back to $0 for zsh/other POSIX shells.
__arasul_script="${BASH_SOURCE[0]:-${(%):-%N}}"
if [[ -z "$__arasul_script" ]]; then
    __arasul_script="$0"
fi

__arasul_tooling="$(cd "$(dirname "$__arasul_script")" && pwd)"
__arasul_root="$(cd "$__arasul_tooling/.." && pwd)"

export RUSTUP_HOME="$__arasul_root/runtime/rust/rustup"
export CARGO_HOME="$__arasul_root/runtime/rust/cargo"

case ":$PATH:" in
    *":$CARGO_HOME/bin:"*) ;;
    *) export PATH="$CARGO_HOME/bin:$PATH" ;;
esac

unset __arasul_script __arasul_tooling __arasul_root

if command -v rustc >/dev/null 2>&1; then
    echo "✓ Rust active: $(rustc --version 2>/dev/null)"
    if command -v cargo-tauri >/dev/null 2>&1; then
        echo "✓ Tauri CLI: $(cargo tauri --version 2>/dev/null | head -n1)"
    fi
else
    echo "⚠ Rust not installed yet — run tooling/install-rust.sh first."
fi
