//! Google Gemini CLI adapter.
//!
//! Free tier via personal Google login (Code Assist license, ~60 rpm limit).
//! Paid usage via `GEMINI_API_KEY` environment variable. Distributed as
//! a global npm package — Node.js 20+ required.

use super::{
    resolve_binary, try_version, AuthStatus, Billing, Capabilities, InstallCommand, Provider,
    ProviderKind, Role,
};

pub struct GeminiProvider;

impl Provider for GeminiProvider {
    fn id(&self) -> &'static str {
        "gemini"
    }
    fn display_name(&self) -> &'static str {
        "Google Gemini"
    }
    fn billing(&self) -> Billing {
        // Free Code Assist tier covers ordinary use; treat as Subscription
        // for the picker (the user signs in with a Google account).
        Billing::Subscription
    }
    fn kind(&self) -> ProviderKind {
        ProviderKind::CliSidecar {
            binary: "gemini".into(),
        }
    }
    fn capabilities(&self) -> Capabilities {
        Capabilities {
            streaming: true,
            tools: true,
            vision: true,
            embeddings: false,
            roles: vec![Role::Chat, Role::Edit, Role::Apply],
        }
    }
    fn auth_status(&self) -> AuthStatus {
        match resolve_binary("gemini") {
            Some(path) => AuthStatus::LoggedIn {
                detail: try_version(&path),
            },
            None => AuthStatus::NotInstalled,
        }
    }
    fn install_command(&self) -> Option<InstallCommand> {
        Some(InstallCommand {
            posix: Some("npm install -g @google/gemini-cli".into()),
            windows_ps: Some("npm install -g @google/gemini-cli".into()),
            prerequisite_note: Some("Requires Node.js 20+ on PATH.".into()),
            docs_url: Some("https://github.com/google-gemini/gemini-cli".into()),
        })
    }
}
