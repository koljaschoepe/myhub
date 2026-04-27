//! Ollama adapter — local model runtime.
//!
//! HTTP at `http://localhost:11434` (OpenAI-compatible at `/v1`). Free,
//! runs entirely on the user's machine, no auth.

use std::time::Duration;

use super::{AuthStatus, Billing, Capabilities, InstallCommand, Provider, ProviderKind, Role};

const OLLAMA_BASE: &str = "http://localhost:11434";

pub struct OllamaProvider;

impl Provider for OllamaProvider {
    fn id(&self) -> &'static str {
        "ollama"
    }
    fn display_name(&self) -> &'static str {
        "Ollama (local)"
    }
    fn billing(&self) -> Billing {
        Billing::Local
    }
    fn kind(&self) -> ProviderKind {
        ProviderKind::HttpApi {
            base_url: OLLAMA_BASE.into(),
        }
    }
    fn capabilities(&self) -> Capabilities {
        Capabilities {
            streaming: true,
            tools: true,
            vision: true,
            embeddings: true,
            roles: vec![Role::Chat, Role::Edit, Role::Embed],
        }
    }
    fn auth_status(&self) -> AuthStatus {
        // Short-timeout HTTP probe. /api/version is cheap and confirms the
        // daemon is running. Failure → NotInstalled (we can't tell the
        // difference between "ollama not installed" and "installed but
        // daemon not running" without a binary probe; surface NotInstalled
        // since the install action covers both — the official installer
        // also ensures the daemon is up).
        let url = format!("{OLLAMA_BASE}/api/version");
        let agent = ureq::AgentBuilder::new()
            .timeout(Duration::from_millis(400))
            .build();
        match agent.get(&url).call() {
            Ok(resp) if resp.status() == 200 => {
                let text = resp.into_string().ok().unwrap_or_default();
                let version = serde_json::from_str::<serde_json::Value>(&text)
                    .ok()
                    .and_then(|v| v.get("version").and_then(|x| x.as_str()).map(|s| s.to_string()));
                AuthStatus::LoggedIn { detail: version }
            }
            Ok(resp) => AuthStatus::Unknown {
                detail: format!("ollama responded {} on /api/version", resp.status()),
            },
            Err(_) => AuthStatus::NotInstalled,
        }
    }
    fn install_command(&self) -> Option<InstallCommand> {
        Some(InstallCommand {
            posix: Some("curl -fsSL https://ollama.com/install.sh | sh".into()),
            // Windows: Ollama ships an .exe installer rather than a script.
            // winget covers the supported automated path.
            windows_ps: Some("winget install Ollama.Ollama".into()),
            prerequisite_note: None,
            docs_url: Some("https://ollama.com/download".into()),
        })
    }
}
