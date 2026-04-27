//! OpenAI Codex CLI adapter.
//!
//! ChatGPT Plus / Pro / Business / Edu / Enterprise subscriptions cover
//! Codex usage; alternative is an OpenAI API key in the user's environment.
//! Distributed as a global npm package — Node.js 18+ required.

use super::{
    resolve_binary, try_version, AuthStatus, Billing, Capabilities, InstallCommand, Provider,
    ProviderKind, Role,
};

pub struct CodexProvider;

impl Provider for CodexProvider {
    fn id(&self) -> &'static str {
        "codex"
    }
    fn display_name(&self) -> &'static str {
        "OpenAI Codex"
    }
    fn billing(&self) -> Billing {
        Billing::Subscription
    }
    fn kind(&self) -> ProviderKind {
        ProviderKind::CliSidecar {
            binary: "codex".into(),
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
        match resolve_binary("codex") {
            Some(path) => AuthStatus::LoggedIn {
                detail: try_version(&path),
            },
            None => AuthStatus::NotInstalled,
        }
    }
    fn install_command(&self) -> Option<InstallCommand> {
        // Codex CLI ships as an npm package. We rely on the user having Node
        // already; if not, the install will fail visibly with a clear stderr
        // and the frontend surfaces the "Try again" path.
        Some(InstallCommand {
            posix: Some("npm install -g @openai/codex".into()),
            windows_ps: Some("npm install -g @openai/codex".into()),
            prerequisite_note: Some("Requires Node.js 18+ on PATH.".into()),
            docs_url: Some("https://developers.openai.com/codex/cli".into()),
        })
    }
}
