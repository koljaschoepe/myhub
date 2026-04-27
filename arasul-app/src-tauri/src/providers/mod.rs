//! Multi-provider abstraction (master plan Phase 5).
//!
//! Each provider is a thin adapter over either:
//!   - **CliSidecar** — a process we spawn (Claude Code, Codex, Gemini,
//!     Cursor). The user's subscription pays. We never touch their token.
//!   - **HttpApi**   — a local or remote OpenAI-compatible HTTP endpoint
//!     (Ollama on localhost:11434).
//!
//! For Day 1, this module gives the frontend three things:
//!   1. A list of every provider we know about (`provider_list`).
//!   2. Per-provider auth + install state (`provider_auth_status`).
//!   3. A "click to install via the vendor's official installer"
//!      shell-out (`provider_install`).
//!
//! Streaming chat per provider is intentionally NOT in this trait yet —
//! Claude Code already has its own dedicated `launch_claude` PTY path,
//! and the other CLIs use headless `-p`/`exec`/`--print` that we'll wire
//! per-feature as needed. This trait stays small until the second pass.

use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;

pub mod claude_code;
pub mod codex;
pub mod commands;
pub mod cursor;
pub mod gemini;
pub mod install;
pub mod ollama;

// =============================================================================
// Public types — stable wire format for the frontend.
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Billing {
    /// User's interactive subscription (Claude Pro/Max, ChatGPT Plus/Pro,
    /// Cursor Pro, Google Code Assist free tier). No tokens billed by us.
    Subscription,
    /// Pay-per-token API key the user supplies and pastes into the vault.
    Api,
    /// Local model — runs on the user's machine, no remote billing.
    Local,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Role {
    Chat,
    Edit,
    Apply,
    Autocomplete,
    Embed,
    Rerank,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Capabilities {
    pub streaming: bool,
    pub tools: bool,
    pub vision: bool,
    pub embeddings: bool,
    pub roles: Vec<Role>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum ProviderKind {
    /// We spawn `binary` as a subprocess. Authentication and billing live
    /// inside the official CLI; we never touch tokens.
    CliSidecar { binary: String },
    /// We talk HTTP to `base_url` (typically OpenAI-compatible).
    HttpApi { base_url: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "state", rename_all = "kebab-case")]
pub enum AuthStatus {
    /// CLI present and authenticated (or HTTP endpoint responding).
    LoggedIn { detail: Option<String> },
    /// CLI present but the user hasn't run the vendor's login flow yet.
    NeedsLogin,
    /// Provider requires an API key the user must paste in (vault-stored).
    NeedsKey,
    /// CLI not found. Frontend should offer the install button.
    NotInstalled,
    /// Probe failed for an unexpected reason — surface to the user.
    Unknown { detail: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallCommand {
    /// Shell command for macOS / Linux / WSL — `bash -c "<cmd>"`.
    pub posix: Option<String>,
    /// Shell command for Windows PowerShell — `powershell -Command "<cmd>"`.
    pub windows_ps: Option<String>,
    /// Human-readable note displayed in the UI before install runs.
    /// e.g. "Requires Node.js 20+." for npm-based installs.
    pub prerequisite_note: Option<String>,
    /// Free-form URL to vendor's documentation, shown next to the install
    /// button as a "Learn more" link.
    pub docs_url: Option<String>,
}

/// Wire-format summary returned by `provider_list`. A flat shape so the
/// frontend can render it without any further introspection.
#[derive(Debug, Clone, Serialize)]
pub struct ProviderSummary {
    pub id: &'static str,
    pub display_name: &'static str,
    pub billing: Billing,
    pub kind: ProviderKind,
    pub capabilities: Capabilities,
    pub install_command: Option<InstallCommand>,
}

// =============================================================================
// Provider trait — implemented per-vendor.
// =============================================================================

pub trait Provider: Send + Sync {
    fn id(&self) -> &'static str;
    fn display_name(&self) -> &'static str;
    fn billing(&self) -> Billing;
    fn kind(&self) -> ProviderKind;
    fn capabilities(&self) -> Capabilities;

    /// Cheap probe — should return in <500ms. CLI providers do `which` plus
    /// optionally `--version`. HTTP providers do a single short-timeout GET.
    fn auth_status(&self) -> AuthStatus;

    /// `None` if there is no automated installer (user must visit a URL).
    fn install_command(&self) -> Option<InstallCommand>;

    /// Convenience for `provider_list`.
    fn summary(&self) -> ProviderSummary {
        ProviderSummary {
            id: self.id(),
            display_name: self.display_name(),
            billing: self.billing(),
            kind: self.kind(),
            capabilities: self.capabilities(),
            install_command: self.install_command(),
        }
    }
}

// =============================================================================
// Registry — one shared instance held in Tauri's State<ProviderState>.
// =============================================================================

pub struct ProviderRegistry {
    providers: Vec<Box<dyn Provider>>,
}

impl ProviderRegistry {
    pub fn new() -> Self {
        let providers: Vec<Box<dyn Provider>> = vec![
            Box::new(claude_code::ClaudeCodeProvider),
            Box::new(codex::CodexProvider),
            Box::new(gemini::GeminiProvider),
            Box::new(cursor::CursorProvider),
            Box::new(ollama::OllamaProvider),
        ];
        Self { providers }
    }

    pub fn list_summaries(&self) -> Vec<ProviderSummary> {
        self.providers.iter().map(|p| p.summary()).collect()
    }

    pub fn get(&self, id: &str) -> Option<&dyn Provider> {
        self.providers
            .iter()
            .find(|p| p.id() == id)
            .map(|b| b.as_ref())
    }
}

impl Default for ProviderRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Default)]
pub struct ProviderState(pub Arc<RwLock<ProviderRegistry>>);

impl ProviderState {
    pub fn new() -> Self {
        Self(Arc::new(RwLock::new(ProviderRegistry::new())))
    }
}

// =============================================================================
// Helpers shared across adapters.
// =============================================================================

/// Like `which(cmd)` but also checks the standard install locations the
/// vendors' installers use (`~/.local/bin`, `/usr/local/bin`,
/// `/opt/homebrew/bin`). Mirrors `claude::resolve_claude_anywhere` but
/// generic. Returns the first hit.
pub(crate) fn resolve_binary(cmd: &str) -> Option<String> {
    if let Some(p) = which(cmd) {
        return Some(p);
    }
    let home = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE"))?;
    let exe = if cfg!(target_os = "windows") {
        format!("{cmd}.exe")
    } else {
        cmd.to_string()
    };
    let candidates: Vec<PathBuf> = if cfg!(target_os = "windows") {
        vec![PathBuf::from(&home).join(".local").join("bin").join(&exe)]
    } else {
        vec![
            PathBuf::from(&home).join(".local").join("bin").join(&exe),
            PathBuf::from("/usr/local/bin").join(&exe),
            PathBuf::from("/opt/homebrew/bin").join(&exe),
        ]
    };
    candidates
        .into_iter()
        .find(|p| p.is_file())
        .map(|p| p.to_string_lossy().to_string())
}

fn which(cmd: &str) -> Option<String> {
    let paths = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&paths) {
        let p = dir.join(cmd);
        if p.is_file() {
            return Some(p.to_string_lossy().to_string());
        }
        #[cfg(target_os = "windows")]
        {
            let p_exe = dir.join(format!("{cmd}.exe"));
            if p_exe.is_file() {
                return Some(p_exe.to_string_lossy().to_string());
            }
        }
    }
    None
}

/// Run `<bin> --version` with a short timeout, return trimmed stdout on
/// success. Used by adapters to fill `AuthStatus::LoggedIn { detail }`.
pub(crate) fn try_version(bin: &str) -> Option<String> {
    let out = std::process::Command::new(bin).arg("--version").output().ok()?;
    if !out.status.success() {
        return None;
    }
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

