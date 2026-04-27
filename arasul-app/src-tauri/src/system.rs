//! System maintenance — api-spec §8.
//!
//! Phase 2 + 4. Mostly delegates to the Go `bin/arasul-cli-*` binary on
//! the drive. Until that binary is built (Phase 5 toolchain), commands
//! return useful-but-scaffolded output so the UI can be exercised.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::ipc::error::{ArasulError, Result};

#[derive(Debug, Default, Deserialize)]
pub struct CompileArgs {
    pub since: Option<String>,
    pub full: Option<bool>,
    pub dry_run: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct VerifyReport {
    pub total_checks: u32,
    pub passed: u32,
    pub warnings: Vec<String>,
    pub errors: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct Stats {
    pub notes: u32,
    pub projects: u32,
    pub lines: u64,
    pub compile_last_ran: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct HealthReport {
    pub drive_free_mb: u64,
    pub vault_present: bool,
    pub claude_binary_present: bool,
    pub memory_consistent: bool,
    pub issues: Vec<String>,
}

#[tauri::command]
pub fn compile(_args: Option<CompileArgs>, drive_root: Option<String>) -> Result<String> {
    let root = drive_root.unwrap_or_else(|| ".".into());
    let cli = locate_cli(&root);
    if cli.is_none() {
        return Ok("compile: arasul-cli not on drive yet (Phase 5). Returning no-op.".into());
    }
    // When the binary exists, shell out and capture output.
    let out = std::process::Command::new(cli.unwrap())
        .args(["compile"])
        .current_dir(&root)
        .output()
        .map_err(|e| ArasulError::Internal { message: format!("compile spawn: {e}") })?;
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

#[tauri::command]
pub fn verify(drive_root: Option<String>) -> Result<VerifyReport> {
    let root = drive_root.unwrap_or_else(|| ".".into());
    let mut report = VerifyReport { total_checks: 0, passed: 0, warnings: vec![], errors: vec![] };

    let checks: &[(&str, Box<dyn Fn(&str) -> std::result::Result<(), String>>)] = &[
        ("vault.enc exists", Box::new(|r| {
            if Path::new(r).join(".boot/vault.enc").exists() { Ok(()) } else { Err("no vault".into()) }
        })),
        ("memory/projects.yaml parses", Box::new(|r| {
            let p = Path::new(r).join("memory/projects.yaml");
            if !p.exists() { return Ok(()); }
            let text = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
            serde_yaml::from_str::<serde_yaml::Value>(&text).map_err(|e| e.to_string())?;
            Ok(())
        })),
        ("content/ dir present", Box::new(|r| {
            if Path::new(r).join("content").exists() { Ok(()) } else { Err("no content dir".into()) }
        })),
    ];

    for (name, f) in checks {
        report.total_checks += 1;
        match f(&root) {
            Ok(()) => report.passed += 1,
            Err(e) => report.errors.push(format!("{name}: {e}")),
        }
    }
    Ok(report)
}

#[tauri::command]
pub fn stats(drive_root: Option<String>) -> Result<Stats> {
    let root = drive_root.unwrap_or_else(|| ".".into());
    let mut notes = 0u32;
    let mut lines = 0u64;
    for entry in walkdir::WalkDir::new(Path::new(&root).join("content")).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            if entry.file_name().to_string_lossy().ends_with(".md") {
                notes += 1;
                if let Ok(text) = std::fs::read_to_string(entry.path()) {
                    lines += text.lines().count() as u64;
                }
            }
        }
    }
    let projects = {
        let p = Path::new(&root).join("memory/projects.yaml");
        if p.exists() {
            let text = std::fs::read_to_string(&p).unwrap_or_default();
            let parsed: serde_yaml::Value = serde_yaml::from_str(&text).unwrap_or(serde_yaml::Value::Null);
            parsed.get("projects").and_then(|v| v.as_sequence()).map(|s| s.len() as u32).unwrap_or(0)
        } else { 0 }
    };
    Ok(Stats { notes, projects, lines, compile_last_ran: None })
}

#[tauri::command]
pub fn health(drive_root: Option<String>) -> Result<HealthReport> {
    let root = drive_root.unwrap_or_else(|| ".".into());
    let vault_present = Path::new(&root).join(".boot/vault.enc").exists();
    let claude_binary_present = locate_claude(&root).is_some();
    let memory_consistent = verify(Some(root.clone())).map(|r| r.errors.is_empty()).unwrap_or(false);

    let issues: Vec<String> = {
        let mut v = vec![];
        if !vault_present { v.push("no vault".into()); }
        if !claude_binary_present { v.push("claude binary not installed — OAuth flow will prompt".into()); }
        v
    };

    Ok(HealthReport {
        drive_free_mb: free_space_mb(&root),
        vault_present,
        claude_binary_present,
        memory_consistent,
        issues,
    })
}

fn locate_cli(root: &str) -> Option<PathBuf> {
    let tag = format!("arasul-cli-{}-{}", os_tag(), arch_tag());
    let p = PathBuf::from(root).join("bin").join(tag);
    if p.exists() { Some(p) } else { None }
}

fn locate_claude(root: &str) -> Option<PathBuf> {
    let tag = format!("claude-{}-{}", os_tag(), arch_tag());
    let p = PathBuf::from(root).join("bin").join(tag);
    if p.exists() { Some(p) } else { None }
}

fn os_tag() -> &'static str {
    #[cfg(target_os = "macos")] { "macos" }
    #[cfg(target_os = "linux")] { "linux" }
    #[cfg(target_os = "windows")] { "windows" }
}

fn arch_tag() -> &'static str {
    #[cfg(target_arch = "aarch64")] { "arm64" }
    #[cfg(target_arch = "x86_64")] { "x64" }
}

fn free_space_mb(_root: &str) -> u64 {
    // Best-effort — shell out to df for v1; Phase 5 hardens via statvfs.
    #[cfg(unix)]
    {
        if let Ok(out) = std::process::Command::new("df").args(["-k", _root]).output() {
            let text = String::from_utf8_lossy(&out.stdout);
            if let Some(line) = text.lines().nth(1) {
                if let Some(kb_str) = line.split_whitespace().nth(3) {
                    if let Ok(kb) = kb_str.parse::<u64>() {
                        return kb / 1024;
                    }
                }
            }
        }
    }
    0
}
