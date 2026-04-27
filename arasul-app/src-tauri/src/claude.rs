//! Claude launch + briefer — api-spec §5.
//!
//! Design (post-2026-04-26 master plan, Phase 3.1): **no-touch auth**.
//!
//! We do not run an OAuth application. We do not read, persist, relay, or log
//! the user's Claude OAuth token. We just spawn the official `claude` CLI with
//! `CLAUDE_CONFIG_DIR=<ARASUL_ROOT>/.claude` so the credentials remain on the
//! SSD (cross-machine portable) but are managed entirely by Anthropic's tool.
//!
//! First launch → Claude runs its own browser login → token lands in
//! `<ARASUL_ROOT>/.claude/.credentials.json`. Subsequent launches reuse it.
//! Ejecting the SSD takes the credentials with it; nothing stays on the host.
//!
//! This explicitly avoids the OpenClaw-style "harness" pattern that Anthropic
//! banned on 2026-04-04. See docs/plans/2026-04-26-master-plan.md §R1.

use std::collections::HashMap;
use std::io::BufRead;
use std::path::PathBuf;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::ipc::error::{ArasulError, Result};
use crate::pty::PtyState;

#[derive(Debug, Deserialize)]
pub struct LaunchClaudeArgs {
    pub project_slug: String,
    pub drive_root: String,
}

#[tauri::command]
pub fn launch_claude(
    app: AppHandle,
    state: State<'_, PtyState>,
    args: LaunchClaudeArgs,
) -> Result<String> {
    let drive_root = PathBuf::from(&args.drive_root);
    let cwd = drive_root.join("content").join("projects").join(&args.project_slug);
    if !cwd.exists() {
        return Err(ArasulError::Internal {
            message: format!("no project dir: {}", cwd.display()),
        });
    }

    let claude_bin = resolve_claude_binary(&args.drive_root);

    // SSD-portable credential path: official CLI writes/reads its own
    // .credentials.json under here. We never touch the file.
    let claude_config_dir = drive_root.join(".claude");
    let plugin_cache_dir = drive_root.join(".claude").join("plugins");

    let mut env = HashMap::new();
    env.insert(
        "CLAUDE_CONFIG_DIR".to_string(),
        claude_config_dir.to_string_lossy().to_string(),
    );
    env.insert(
        "CLAUDE_CODE_PLUGIN_CACHE_DIR".to_string(),
        plugin_cache_dir.to_string_lossy().to_string(),
    );
    env.insert("ARASUL_PROJECT".to_string(), args.project_slug.clone());

    let id = crate::pty::pty_open(
        app,
        state,
        claude_bin,
        None,
        Some(cwd.to_string_lossy().to_string()),
        Some(env),
        Some(80),
        Some(24),
    )
    .map_err(|e| ArasulError::Internal {
        message: format!("pty spawn: {}", serde_json::to_string(&e).unwrap_or_default()),
    })?;

    Ok(id)
}

fn resolve_claude_binary(drive_root: &str) -> String {
    // SSD-local back-compat: bin/claude-<os>-<arch> takes precedence if a
    // user manually placed a binary there. Otherwise fall through to the
    // shared resolver (PATH + standard install locations).
    let tag = format!("claude-{}-{}", os_tag(), arch_tag());
    let on_drive = PathBuf::from(drive_root).join("bin").join(&tag);
    if on_drive.exists() {
        return on_drive.to_string_lossy().to_string();
    }
    crate::providers::resolve_binary("claude").unwrap_or_else(|| "claude".to_string())
}

/// Briefer — streams via event channel. Phase 3.2.
#[tauri::command]
pub fn ask_briefer(app: AppHandle, prompt: String) -> Result<String> {
    let session = Uuid::new_v4().to_string();
    let channel = format!("briefer://{session}/chunk");
    let app2 = app.clone();
    let chan = channel.clone();
    thread::spawn(move || {
        if let Some(claude) = crate::providers::resolve_binary("claude") {
            run_claude_headless(app2, &chan, &claude, &prompt);
        } else {
            canned_reply(app2, &chan, &prompt);
        }
    });
    Ok(channel)
}

fn run_claude_headless(app: AppHandle, channel: &str, claude: &str, prompt: &str) {
    let pty_system = native_pty_system();
    let pair = match pty_system.openpty(PtySize { rows: 24, cols: 120, pixel_width: 0, pixel_height: 0 }) {
        Ok(p) => p,
        Err(e) => { let _ = app.emit(channel, serde_json::json!({ "delta": format!("(briefer: {e})"), "done": true })); return; }
    };
    let mut cmd = CommandBuilder::new(claude);
    cmd.args(["-p", "--agent", "briefer", prompt]);
    let child = match pair.slave.spawn_command(cmd) {
        Ok(c) => Arc::new(Mutex::new(c)),
        Err(e) => { let _ = app.emit(channel, serde_json::json!({ "delta": format!("(briefer: {e})"), "done": true })); return; }
    };
    let reader = match pair.master.try_clone_reader() {
        Ok(r) => r,
        Err(e) => { let _ = app.emit(channel, serde_json::json!({ "delta": format!("(briefer reader: {e})"), "done": true })); return; }
    };
    let mut lines = std::io::BufReader::new(reader).lines();
    while let Some(Ok(line)) = lines.next() {
        let _ = app.emit(channel, serde_json::json!({ "delta": format!("{line}\n") }));
    }
    let _ = child.lock().wait();
    let _ = app.emit(channel, serde_json::json!({ "done": true }));
}

fn canned_reply(app: AppHandle, channel: &str, prompt: &str) {
    let reply = format!(
        "(briefer dev-stub — `claude` CLI not found on PATH or at `bin/claude-<os>-<arch>`)\n\n\
         You asked: _{prompt}_\n\n\
         Install Claude Code via the Onboarding step or run \
         `curl -fsSL https://claude.ai/install.sh | bash`. First launch will open your browser \
         for an Anthropic login — credentials are written by Claude itself into \
         `<SSD>/.claude/`, which travels with the drive."
    );
    for chunk in reply.split_inclusive(' ') {
        let _ = app.emit(channel, serde_json::json!({ "delta": chunk }));
        std::thread::sleep(Duration::from_millis(8));
    }
    let _ = app.emit(channel, serde_json::json!({ "done": true }));
}

/// Synchronous `claude -p` for inline AI ops (slash menu, ⌘K).
/// One-shot: collects full stdout, returns. Non-streaming per scope-lock
/// 2026-04-26 — direct streaming arrives with the workflow runner
/// (vision-v3 §3.3 Phase 3) when reqwest streaming + vault_with_secret
/// land together.
#[derive(Debug, Deserialize)]
pub struct InlineOpArgs {
    pub system: String,
    pub content: String,
}

#[tauri::command]
pub fn claude_inline_op(args: InlineOpArgs) -> Result<String> {
    let claude = crate::providers::resolve_binary("claude").ok_or_else(|| ArasulError::Internal {
        message: "Claude CLI not found. Install Claude Code via the Onboarding step \
                  or place a binary at bin/claude-<os>-<arch> on the SSD.".into(),
    })?;

    // Combine system + content into one -p prompt. The system prompt
    // narrates behavior; the content is fenced as ===input=== so claude
    // can find the boundary unambiguously.
    let combined = format!(
        "{}\n\n===input===\n{}\n===end===\n\nReply with ONLY the transformed text. \
         No preamble, no commentary, no markdown code fences around the result.",
        args.system.trim(),
        args.content.trim(),
    );

    let output = std::process::Command::new(&claude)
        .args(["-p", &combined])
        .output()
        .map_err(|e| ArasulError::Internal {
            message: format!("claude exec failed: {e}"),
        })?;

    if !output.status.success() {
        return Err(ArasulError::Internal {
            message: format!(
                "claude exited {} — {}",
                output.status.code().unwrap_or(-1),
                String::from_utf8_lossy(&output.stderr).trim()
            ),
        });
    }

    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() {
        return Err(ArasulError::Internal {
            message: "claude returned an empty response".into(),
        });
    }
    Ok(text)
}

// =============================================================================
// Phase 4 — Onboarding auto-install for the official `claude` CLI.
//
// We do NOT bundle the binary (proprietary, "All rights reserved"). Instead we
// orchestrate Anthropic's own installer from inside the Onboarding wizard so
// the user never has to open a terminal.
//
// macOS / Linux / WSL  →  curl -fsSL https://claude.ai/install.sh | bash
// Windows PowerShell    →  irm https://claude.ai/install.ps1 | iex
//
// Output streams over a Tauri event channel so the frontend can render a
// progress log. The installer drops the binary at ~/.local/bin/claude (POSIX)
// or %USERPROFILE%\.local\bin\claude.exe (Windows) and auto-updates itself
// from then on.
// =============================================================================

#[derive(Debug, Serialize)]
pub struct ClaudeInstallStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub path: Option<String>,
}

#[tauri::command]
pub fn claude_install_status() -> Result<ClaudeInstallStatus> {
    let path = crate::providers::resolve_binary("claude");
    if let Some(p) = path {
        let version = std::process::Command::new(&p)
            .arg("--version")
            .output()
            .ok()
            .and_then(|o| {
                if o.status.success() {
                    Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
                } else {
                    None
                }
            });
        Ok(ClaudeInstallStatus {
            installed: true,
            version,
            path: Some(p),
        })
    } else {
        Ok(ClaudeInstallStatus {
            installed: false,
            version: None,
            path: None,
        })
    }
}

#[tauri::command]
pub fn claude_install(app: AppHandle) -> Result<String> {
    let session = Uuid::new_v4().to_string();
    let channel = format!("claude-install://{session}/chunk");
    let app2 = app.clone();
    let chan = channel.clone();
    thread::spawn(move || {
        run_install_script(app2, &chan);
    });
    Ok(channel)
}

fn run_install_script(app: AppHandle, channel: &str) {
    let (cmd, args, label): (&str, Vec<&str>, &str) = if cfg!(target_os = "windows") {
        (
            "powershell",
            vec!["-NoProfile", "-Command", "irm https://claude.ai/install.ps1 | iex"],
            "irm https://claude.ai/install.ps1 | iex",
        )
    } else {
        (
            "bash",
            vec!["-c", "curl -fsSL https://claude.ai/install.sh | bash"],
            "curl -fsSL https://claude.ai/install.sh | bash",
        )
    };

    let _ = app.emit(
        channel,
        serde_json::json!({ "delta": format!("$ {label}\n") }),
    );

    let mut child = match std::process::Command::new(cmd)
        .args(&args)
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
        thread::spawn(move || {
            let reader = std::io::BufReader::new(r);
            for line in reader.lines() {
                let Ok(line) = line else { break };
                let _ = app_out
                    .emit(&chan_out, serde_json::json!({ "delta": format!("{line}\n") }));
            }
        })
    });

    let app_err = app.clone();
    let chan_err = channel.to_string();
    let t_err = stderr.map(|r| {
        thread::spawn(move || {
            let reader = std::io::BufReader::new(r);
            for line in reader.lines() {
                let Ok(line) = line else { break };
                let _ = app_err.emit(
                    &chan_err,
                    serde_json::json!({ "delta": format!("{line}\n"), "stream": "stderr" }),
                );
            }
        })
    });

    let status = child.wait();
    if let Some(t) = t_out {
        let _ = t.join();
    }
    if let Some(t) = t_err {
        let _ = t.join();
    }

    let ok = status.as_ref().map(|s| s.success()).unwrap_or(false);
    let exit_code = status.ok().and_then(|s| s.code());

    // Re-resolve to confirm the binary is now installed.
    let final_path = crate::providers::resolve_binary("claude");
    let _ = app.emit(
        channel,
        serde_json::json!({
            "done": true,
            "ok": ok && final_path.is_some(),
            "exit_code": exit_code,
            "resolved_path": final_path,
        }),
    );
}

// Phase 6.1 — `which()` and `resolve_claude_anywhere()` removed; both
// duplicated `crate::providers::resolve_binary`. The shared helper now
// owns the SSD/`PATH`/`~/.local/bin`/`/usr/local/bin`/`/opt/homebrew/bin`
// fallback chain — see `providers/mod.rs::resolve_binary`.

fn os_tag() -> &'static str {
    #[cfg(target_os = "macos")] { "macos" }
    #[cfg(target_os = "linux")] { "linux" }
    #[cfg(target_os = "windows")] { "windows" }
}

fn arch_tag() -> &'static str {
    #[cfg(target_arch = "aarch64")] { "arm64" }
    #[cfg(target_arch = "x86_64")] { "x64" }
}
