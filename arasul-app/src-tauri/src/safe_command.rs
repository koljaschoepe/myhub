//! Subprocess allowlist.
//!
//! Phase F hardening. Every binary this app may spawn MUST appear in the
//! lists below. The goal is twofold:
//!
//!   1. Make "what does this app shell out to?" answerable by reading
//!      this single file, not by grepping for `Command::new(`.
//!   2. Block accidental drift if a future change tries to spawn a
//!      binary the security model didn't account for. Compromised
//!      frontend code can already only invoke registered Tauri commands;
//!      this layer further constrains what those commands may do.
//!
//! Two helpers:
//!
//!   - `system_command(name)` — for binaries we expect to find on the
//!     user's $PATH (git, launchctl, systemctl, df, gh, open).
//!   - `ssd_command(drive_root, rel)` — for binaries shipped on the SSD
//!     under `bin/` or `runtime/` (claude, myhub-tui, …).
//!
//! Both reject anything not on the list with a clear error.

use std::path::{Path, PathBuf};
use std::process::Command;

use crate::ipc::error::{ArasulError, Result};

/// System binaries we may invoke from this app. Resolved by the OS via
/// $PATH — we trust the OS to have the right one because that's what
/// every CLI tool everywhere does. If you find yourself wanting to add
/// to this list, ask whether the work could happen in pure Rust first.
pub const ALLOWED_SYSTEM: &[&str] = &[
    "git",        // §4 projects + §4b github
    "gh",         // optional GitHub CLI fallback
    "open",       // macOS reveal-in-finder
    "explorer.exe", // Windows reveal-in-finder
    "xdg-open",   // Linux reveal-in-finder
    "launchctl",  // §9 macOS auto-launch
    "systemctl",  // §9 Linux auto-launch
    "df",         // §8 system stats
    "afplay",     // §boot connect sound (host wrapper, not invoked here today)
];

/// Files under these top-level directories of the drive are runnable.
/// `claude`, `arasul-cli`, `myhub-tui` all live in `bin/`.
pub const ALLOWED_SSD_DIRS: &[&str] = &["bin", "runtime"];

/// Build a `Command` for a system binary on $PATH. Errors if `name`
/// isn't in the allowlist or contains a path separator (which would
/// make it not-a-name).
pub fn system_command(name: &str) -> Result<Command> {
    if name.contains('/') || name.contains('\\') {
        return Err(ArasulError::Internal {
            message: format!("system_command rejects paths: {name}"),
        });
    }
    if !ALLOWED_SYSTEM.contains(&name) {
        return Err(ArasulError::Internal {
            message: format!("system_command not on allowlist: {name}"),
        });
    }
    Ok(Command::new(name))
}

/// Build a `Command` for a binary inside the SSD root. The `rel` path
/// MUST be relative and MUST start with one of `ALLOWED_SSD_DIRS` after
/// canonicalization — both guards block traversal.
pub fn ssd_command(drive_root: &Path, rel: &str) -> Result<Command> {
    if rel.contains("..") {
        return Err(ArasulError::Internal {
            message: format!("ssd_command rejects ../: {rel}"),
        });
    }
    let target = drive_root.join(rel);
    let canon = target.canonicalize().map_err(|e| ArasulError::Internal {
        message: format!("ssd_command target not found: {} ({e})", target.display()),
    })?;
    let canon_root = drive_root.canonicalize().map_err(|e| ArasulError::Internal {
        message: format!("ssd_command drive_root not found: {e}"),
    })?;
    if !canon.starts_with(&canon_root) {
        return Err(ArasulError::Internal {
            message: format!("ssd_command target escapes drive: {}", canon.display()),
        });
    }
    let after_root = canon.strip_prefix(&canon_root).unwrap_or(&canon);
    let top = after_root.iter().next().and_then(|c| c.to_str()).unwrap_or("");
    if !ALLOWED_SSD_DIRS.contains(&top) {
        return Err(ArasulError::Internal {
            message: format!("ssd_command target outside allowed dirs: {}", canon.display()),
        });
    }
    Ok(Command::new(canon))
}

/// Convenience: where the bundled `claude` binary lives. Used by the
/// claude module — single source of truth for the path so a rename is
/// a one-line change.
#[allow(dead_code)]
pub fn claude_path(drive_root: &Path) -> PathBuf {
    drive_root.join("bin").join("claude")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn system_allows_git() {
        assert!(system_command("git").is_ok());
    }

    #[test]
    fn system_rejects_unknown() {
        assert!(system_command("rm").is_err());
        assert!(system_command("curl").is_err());
        assert!(system_command("/usr/bin/git").is_err());
        assert!(system_command("../etc/passwd").is_err());
    }

    #[test]
    fn ssd_rejects_traversal() {
        let dir = tempfile::tempdir().unwrap();
        let res = ssd_command(dir.path(), "../etc/passwd");
        assert!(res.is_err());
    }

    #[test]
    fn ssd_rejects_outside_allowed_dirs() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("evil")).unwrap();
        std::fs::write(dir.path().join("evil/x"), "").unwrap();
        let res = ssd_command(dir.path(), "evil/x");
        assert!(res.is_err());
    }

    #[test]
    fn ssd_allows_bin_subpath() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("bin")).unwrap();
        std::fs::write(dir.path().join("bin/foo"), "").unwrap();
        // canonicalize() requires the target to exist, which we did.
        let res = ssd_command(dir.path(), "bin/foo");
        assert!(res.is_ok(), "expected Ok, got {res:?}");
    }
}
