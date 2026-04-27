//! Generic shell-install runner for `provider_install`.
//!
//! Claude Code's onboarding-install path (Phase 4) was the first user; the
//! same pattern applies to Cursor (curl-installer), Ollama (curl-installer),
//! Codex (npm), and Gemini (npm). This module factors the streaming-spawn
//! logic out so each provider just supplies its `InstallCommand`.

use std::io::BufRead;
use std::thread;

use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::ipc::error::{ArasulError, Result};

use super::{InstallCommand, Provider};

/// Spawn the OS-appropriate install command on a background thread, stream
/// stdout/stderr line-by-line over a Tauri event channel, emit a final
/// `{ done: true, ok, exit_code, resolved_path }` event when finished.
///
/// Returns the channel name. Frontend listens via `listen<InstallChunk>(channel, …)`.
pub fn spawn_install(app: AppHandle, provider: &dyn Provider) -> Result<String> {
    let install = provider.install_command().ok_or_else(|| ArasulError::Internal {
        message: format!(
            "provider {} has no automated installer; visit the vendor's docs",
            provider.id()
        ),
    })?;

    let (cmd, args, label) = match resolve_install_for_os(&install) {
        Some(triple) => triple,
        None => {
            return Err(ArasulError::Internal {
                message: format!(
                    "provider {} has no install script for {}; visit the vendor's docs",
                    provider.id(),
                    if cfg!(target_os = "windows") { "Windows" } else { "this OS" }
                ),
            })
        }
    };

    let session = Uuid::new_v4().to_string();
    let channel = format!("provider-install://{session}/chunk");
    let app2 = app.clone();
    let chan = channel.clone();
    let provider_id = provider.id().to_string();
    let cmd_owned = cmd.to_string();
    let args_owned: Vec<String> = args.into_iter().map(|s| s.to_string()).collect();

    thread::spawn(move || {
        run_in_thread(app2, &chan, &provider_id, &cmd_owned, &args_owned, &label);
    });

    Ok(channel)
}

fn run_in_thread(
    app: AppHandle,
    channel: &str,
    provider_id: &str,
    cmd: &str,
    args: &[String],
    label: &str,
) {
    let _ = app.emit(channel, serde_json::json!({ "delta": format!("$ {label}\n") }));

    let mut child = match std::process::Command::new(cmd)
        .args(args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            let _ = app.emit(
                channel,
                serde_json::json!({
                    "delta": format!("install spawn failed: {e}\n"),
                    "done": true,
                    "ok": false,
                    "exit_code": serde_json::Value::Null,
                    "resolved_path": serde_json::Value::Null,
                    "provider_id": provider_id,
                }),
            );
            return;
        }
    };

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let app_out = app.clone();
    let chan_out = channel.to_string();
    let t_out = stdout.map(|r| {
        thread::spawn(move || stream_lines(app_out, &chan_out, r, false))
    });

    let app_err = app.clone();
    let chan_err = channel.to_string();
    let t_err = stderr.map(|r| {
        thread::spawn(move || stream_lines(app_err, &chan_err, r, true))
    });

    let status = child.wait();
    if let Some(t) = t_out {
        let _ = t.join();
    }
    if let Some(t) = t_err {
        let _ = t.join();
    }

    let ok_status = status.as_ref().map(|s| s.success()).unwrap_or(false);
    let exit_code = status.ok().and_then(|s| s.code());

    // Re-resolve to confirm the binary is now installed (CLI providers only).
    // For HTTP providers there's nothing to resolve — frontend re-probes
    // via `provider_auth_status`.
    let resolved_path = detect_resolve_target(provider_id)
        .and_then(super::resolve_binary);
    let ok = ok_status && (resolved_path.is_some() || provider_id == "ollama");

    let _ = app.emit(
        channel,
        serde_json::json!({
            "done": true,
            "ok": ok,
            "exit_code": exit_code,
            "resolved_path": resolved_path,
            "provider_id": provider_id,
        }),
    );
}

fn stream_lines<R: std::io::Read + Send + 'static>(
    app: AppHandle,
    channel: &str,
    reader: R,
    is_stderr: bool,
) {
    let buf = std::io::BufReader::new(reader);
    for line in buf.lines() {
        let Ok(line) = line else { break };
        if is_stderr {
            let _ = app.emit(
                channel,
                serde_json::json!({ "delta": format!("{line}\n"), "stream": "stderr" }),
            );
        } else {
            let _ = app.emit(channel, serde_json::json!({ "delta": format!("{line}\n") }));
        }
    }
}

fn resolve_install_for_os<'a>(
    install: &'a InstallCommand,
) -> Option<(&'static str, Vec<&'a str>, String)> {
    if cfg!(target_os = "windows") {
        let cmd = install.windows_ps.as_deref()?;
        Some((
            "powershell",
            vec!["-NoProfile", "-Command", cmd],
            cmd.to_string(),
        ))
    } else {
        let cmd = install.posix.as_deref()?;
        Some(("bash", vec!["-c", cmd], cmd.to_string()))
    }
}

/// Map provider id → the binary name we expect to find on PATH after install.
/// Ollama doesn't install a CLI we depend on (we hit its HTTP API), so we
/// return "ollama" anyway as a best-effort cue; HTTP probe remains the truth.
/// Unknown ids return None — caller's `resolved_path` will then be None and
/// the frontend falls back to the post-install `provider_auth_status` re-probe.
fn detect_resolve_target(provider_id: &str) -> Option<&'static str> {
    match provider_id {
        "claude-code" => Some("claude"),
        "codex" => Some("codex"),
        "gemini" => Some("gemini"),
        "cursor" => Some("cursor-agent"),
        "ollama" => Some("ollama"),
        _ => None,
    }
}

