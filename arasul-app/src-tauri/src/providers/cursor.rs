//! Cursor CLI adapter.
//!
//! Cursor Pro subscription covers the included CLI; cloud-agent runs use
//! additional credits. Native installer (Rust binary).

use super::{
    resolve_binary, try_version, AuthStatus, Billing, Capabilities, InstallCommand, Provider,
    ProviderKind, Role,
};

pub struct CursorProvider;

impl Provider for CursorProvider {
    fn id(&self) -> &'static str {
        "cursor"
    }
    fn display_name(&self) -> &'static str {
        "Cursor CLI"
    }
    fn billing(&self) -> Billing {
        Billing::Subscription
    }
    fn kind(&self) -> ProviderKind {
        ProviderKind::CliSidecar {
            binary: "cursor-agent".into(),
        }
    }
    fn capabilities(&self) -> Capabilities {
        Capabilities {
            streaming: true,
            tools: true,
            vision: true,
            embeddings: false,
            roles: vec![Role::Chat, Role::Edit, Role::Apply, Role::Autocomplete],
        }
    }
    fn auth_status(&self) -> AuthStatus {
        // The Cursor CLI binary is named `cursor-agent`. Probe for that.
        match resolve_binary("cursor-agent") {
            Some(path) => AuthStatus::LoggedIn {
                detail: try_version(&path),
            },
            None => AuthStatus::NotInstalled,
        }
    }
    fn install_command(&self) -> Option<InstallCommand> {
        Some(InstallCommand {
            posix: Some("curl https://cursor.com/install -fsS | bash".into()),
            windows_ps: None, // Cursor CLI on Windows is currently distributed via the desktop app installer.
            prerequisite_note: None,
            docs_url: Some("https://cursor.com/docs/cli/overview".into()),
        })
    }
}
