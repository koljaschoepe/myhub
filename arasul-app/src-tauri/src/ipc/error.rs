//! Unified error type for IPC v1.0 — mirrors `arasul-api-spec.md` §0.
//!
//! Serialises as `{ "kind": "…", …fields }` via `serde(tag = "kind")`.

use serde::Serialize;

#[derive(Debug, Serialize, thiserror::Error)]
#[serde(tag = "kind")]
pub enum ArasulError {
    #[error("vault locked")]
    #[serde(rename = "vault_locked")]
    VaultLocked,

    #[error("wrong passphrase")]
    #[serde(rename = "vault_wrong_passphrase")]
    VaultWrongPassphrase,

    #[error("drive disappeared")]
    #[serde(rename = "drive_disappeared")]
    DriveDisappeared,

    #[error("fs error: {message}")]
    #[serde(rename = "fs_io")]
    FsIo { message: String },

    #[error("claude launch failed: {message}")]
    #[serde(rename = "claude_launch")]
    ClaudeLaunch { message: String },

    #[error("pty {id} closed")]
    #[serde(rename = "pty_closed")]
    PtyClosed { id: String },

    #[error("not supported on {os}")]
    #[serde(rename = "not_supported_on_os")]
    NotSupportedOnOs { os: String },

    #[error("internal error: {message}")]
    #[serde(rename = "internal")]
    Internal { message: String },
}

impl ArasulError {
    /// Helper for Phase 0 stubs.
    pub fn not_implemented(what: &str) -> Self {
        Self::Internal { message: format!("{what}: not yet implemented (ipc v1.0 stub)") }
    }
}

impl From<std::io::Error> for ArasulError {
    fn from(e: std::io::Error) -> Self {
        Self::FsIo { message: e.to_string() }
    }
}

pub type Result<T> = std::result::Result<T, ArasulError>;
