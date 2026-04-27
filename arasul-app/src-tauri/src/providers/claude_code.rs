//! Anthropic Claude Code adapter.
//!
//! Default subscription-billed provider. Auth is owned entirely by the
//! official CLI — we never touch the OAuth token. See `claude.rs` for the
//! existing PTY launch path.

use super::{
    resolve_binary, try_version, AuthStatus, Billing, Capabilities, InstallCommand, Provider,
    ProviderKind, Role,
};

pub struct ClaudeCodeProvider;

impl Provider for ClaudeCodeProvider {
    fn id(&self) -> &'static str {
        "claude-code"
    }
    fn display_name(&self) -> &'static str {
        "Claude Code"
    }
    fn billing(&self) -> Billing {
        Billing::Subscription
    }
    fn kind(&self) -> ProviderKind {
        ProviderKind::CliSidecar {
            binary: "claude".into(),
        }
    }
    fn capabilities(&self) -> Capabilities {
        Capabilities {
            streaming: true,
            tools: true,
            vision: true,
            embeddings: false,
            roles: vec![
                Role::Chat,
                Role::Edit,
                Role::Apply,
                Role::Autocomplete,
            ],
        }
    }
    fn auth_status(&self) -> AuthStatus {
        match resolve_binary("claude") {
            Some(path) => {
                let detail = try_version(&path);
                // We can't cheaply distinguish "installed but not logged in"
                // from "installed and logged in" without spawning the CLI
                // and parsing output — too slow for a status probe. Treat
                // installed = LoggedIn; first chat invocation will surface
                // the browser login if needed.
                AuthStatus::LoggedIn { detail }
            }
            None => AuthStatus::NotInstalled,
        }
    }
    fn install_command(&self) -> Option<InstallCommand> {
        Some(InstallCommand {
            posix: Some("curl -fsSL https://claude.ai/install.sh | bash".into()),
            windows_ps: Some("irm https://claude.ai/install.ps1 | iex".into()),
            prerequisite_note: None,
            docs_url: Some("https://code.claude.com/docs/en/setup".into()),
        })
    }
}
