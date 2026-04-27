//! Platform introspection + config — api-spec §1.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::ipc::error::{ArasulError, Result};

/// Probe for the user's Arasul SSD. The canonical mount label is `myhub`,
/// matching the volume name set when imaging the drive in `tooling/image-ssd.sh`.
///
/// Resolution order (first match wins):
///   1. /Volumes/myhub  (production: the real SSD plugged in)
///   2. $ARASUL_ROOT    (dev override; must contain `.boot/`)
///   3. CWD             (dev fallback; the repo itself acts as the drive)
///
/// Returns the root path. Errors only when nothing matches — caller should
/// surface a "Plug in your drive" message.
#[tauri::command]
pub fn detect_drive_root() -> Result<String> {
    if let Some(p) = probe(Path::new("/Volumes/myhub")) { return Ok(p); }
    if let Ok(env) = std::env::var("ARASUL_ROOT") {
        if let Some(p) = probe(Path::new(&env)) { return Ok(p); }
    }
    if let Ok(cwd) = std::env::current_dir() {
        if let Some(p) = probe(&cwd) { return Ok(p); }
    }
    Err(ArasulError::Internal {
        message: "Couldn't find your Arasul drive. Plug in the drive labeled 'myhub' and try again.".into(),
    })
}

fn probe(p: &Path) -> Option<String> {
    if p.join(".boot").exists() {
        Some(canonical(p))
    } else {
        None
    }
}

fn canonical(p: &Path) -> String {
    p.canonicalize()
        .unwrap_or_else(|_| PathBuf::from(p))
        .to_string_lossy()
        .to_string()
}

#[derive(Debug, Serialize)]
pub struct PlatformInfo {
    pub os: String,
    pub arch: String,
    pub auto_launch_supported: bool,
    pub auto_launch_installed: bool,
    pub first_run: bool,
    pub drive_mount_point: String,
    pub app_version: String,
}

#[tauri::command]
pub fn get_platform(drive_root: Option<String>) -> Result<PlatformInfo> {
    let root = drive_root.unwrap_or_else(|| ".".to_string());
    Ok(PlatformInfo {
        os: os_tag().to_string(),
        arch: arch_tag().to_string(),
        auto_launch_supported: cfg!(any(target_os = "macos", target_os = "linux", target_os = "windows")),
        auto_launch_installed: crate::auto_launch::is_installed().unwrap_or(false),
        first_run: !Path::new(&root).join(".boot").join("vault.enc").exists(),
        drive_mount_point: root,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

#[tauri::command]
pub fn get_config(drive_root: String) -> Result<serde_json::Value> {
    let p = Path::new(&drive_root).join("memory").join("config.toml");
    if !p.exists() {
        return Ok(serde_json::json!({}));
    }
    let text = fs::read_to_string(&p)?;
    let value: toml::Value = toml::from_str(&text).map_err(|e| ArasulError::Internal {
        message: format!("config.toml parse: {e}"),
    })?;
    // Convert toml::Value → serde_json::Value.
    let json_str = serde_json::to_string(&value).map_err(|e| ArasulError::Internal {
        message: format!("config.toml → json: {e}"),
    })?;
    Ok(serde_json::from_str(&json_str).unwrap_or(serde_json::json!({})))
}

#[tauri::command]
pub fn set_config(drive_root: String, patch: serde_json::Value) -> Result<()> {
    let p = Path::new(&drive_root).join("memory").join("config.toml");
    fs::create_dir_all(p.parent().unwrap())?;

    let existing: serde_json::Value = if p.exists() {
        let text = fs::read_to_string(&p)?;
        let value: toml::Value = toml::from_str(&text).map_err(|e| ArasulError::Internal {
            message: format!("config.toml parse: {e}"),
        })?;
        serde_json::from_str(&serde_json::to_string(&value).unwrap_or_default()).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    let merged = merge_json(existing, patch);
    let merged_toml: toml::Value = serde_json::from_value(merged).map_err(|e| ArasulError::Internal {
        message: format!("json → toml: {e}"),
    })?;
    let text = toml::to_string(&merged_toml).map_err(|e| ArasulError::Internal {
        message: format!("toml serialize: {e}"),
    })?;
    let tmp = p.with_extension("tmp");
    fs::write(&tmp, text)?;
    if p.exists() { fs::remove_file(&p)?; }
    fs::rename(&tmp, &p)?;
    Ok(())
}

fn merge_json(mut a: serde_json::Value, b: serde_json::Value) -> serde_json::Value {
    if let (serde_json::Value::Object(ref mut aobj), serde_json::Value::Object(bobj)) = (&mut a, b.clone()) {
        for (k, v) in bobj {
            let existing = aobj.remove(&k).unwrap_or(serde_json::json!(null));
            aobj.insert(k, merge_json(existing, v));
        }
        a
    } else {
        b
    }
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
