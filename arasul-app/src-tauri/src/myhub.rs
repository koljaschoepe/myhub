//! myhub-tui spawn — the right-pane terminal for the Arasul GUI.
//!
//! We don't auto-launch any single AI agent. Instead we boot the
//! `myhub-tui` Python TUI (prompt_toolkit + rich) which exposes
//! `/claude`, `/codex` (future), `/lazygit`, `/git`, `/new`, `/open`
//! as slash-commands. The TUI's existing exec-replace + respawn marker
//! pattern is honored by the wrapper script `bin/arasul-tui-pane`.
//!
//! If `bin/arasul-tui-pane` or the SSD's Python runtime is missing, the
//! wrapper drops to plain bash — never to Claude — so the user keeps
//! a usable terminal without an unexpected agent firing up.
//!
//! Environment passed in:
//!   ARASUL_DRIVE_ROOT — drive mount point
//!   ARASUL_PROJECT    — current project slug (may be empty)
//!   MYHUB_ROOT        — alias for drive root, consumed by myhub-tui itself

use std::collections::HashMap;
use std::path::PathBuf;

use serde::Deserialize;
use tauri::{AppHandle, State};

use crate::ipc::error::{ArasulError, Result};
use crate::pty::PtyState;

#[derive(Debug, Deserialize)]
pub struct LaunchTuiArgs {
    pub drive_root: String,
    pub project_slug: Option<String>,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
}

#[tauri::command]
pub fn launch_myhub_tui(
    app: AppHandle,
    state: State<'_, PtyState>,
    args: LaunchTuiArgs,
) -> Result<String> {
    let drive_root = PathBuf::from(&args.drive_root);
    if !drive_root.exists() {
        return Err(ArasulError::Internal {
            message: format!("drive root does not exist: {}", drive_root.display()),
        });
    }

    let launcher = drive_root.join("bin").join("arasul-tui-pane");
    if !launcher.exists() {
        return Err(ArasulError::Internal {
            message: format!(
                "launcher missing: {} — re-install the SSD scripts",
                launcher.display()
            ),
        });
    }

    let project = args.project_slug.unwrap_or_default();
    let cwd = if !project.is_empty() {
        let p = drive_root.join("content").join("projects").join(&project);
        if p.exists() { p } else { drive_root.clone() }
    } else {
        drive_root.clone()
    };

    let mut env: HashMap<String, String> = HashMap::new();
    env.insert(
        "ARASUL_DRIVE_ROOT".to_string(),
        drive_root.to_string_lossy().to_string(),
    );
    env.insert("MYHUB_ROOT".to_string(), drive_root.to_string_lossy().to_string());
    env.insert("ARASUL_PROJECT".to_string(), project);
    env.insert("TERM".to_string(), "xterm-256color".to_string());

    let id = crate::pty::pty_open(
        app,
        state,
        "bash".to_string(),
        Some(vec![launcher.to_string_lossy().to_string()]),
        Some(cwd.to_string_lossy().to_string()),
        Some(env),
        Some(args.cols.unwrap_or(80)),
        Some(args.rows.unwrap_or(24)),
    )
    .map_err(|e| ArasulError::Internal {
        message: format!(
            "pty spawn arasul-tui-pane: {}",
            serde_json::to_string(&e).unwrap_or_default()
        ),
    })?;

    Ok(id)
}
