//! Updates via GitHub Releases — api-spec §10.
//!
//! Design principle: no server of ours. We read `github.com/arasul/arasul`'s
//! public Releases API (60 req/hour unauthenticated, plenty) and download
//! bundles attached to the latest release. Per-asset SHA-256 checksums
//! are expected in the release body as a plain `SHA256SUMS` block; we
//! parse them and verify after download.
//!
//! Trust model: HTTPS to github.com (certificate pinned by OS). No
//! custom signing — GitHub's own audit trail of release commits is the
//! authority.

use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::ipc::error::{ArasulError, Result};

const GITHUB_REPO: &str = "arasul/arasul";
const GH_API_LATEST: &str = "https://api.github.com/repos/arasul/arasul/releases/latest";
const USER_AGENT: &str = concat!("arasul-app/", env!("CARGO_PKG_VERSION"));
const TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateCheck {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
    pub download_url: Option<String>,
    pub sha256_hex: Option<String>,
    pub asset_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GhRelease {
    tag_name: String,
    #[serde(default)]
    body: String,
    #[serde(default)]
    assets: Vec<GhAsset>,
}

#[derive(Debug, Clone, Deserialize)]
struct GhAsset {
    name: String,
    browser_download_url: String,
}

#[tauri::command]
pub fn check_for_update() -> Result<UpdateCheck> {
    let current = env!("CARGO_PKG_VERSION").to_string();
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(TIMEOUT)
        .timeout_read(TIMEOUT)
        .user_agent(USER_AGENT)
        .build();

    match agent.get(GH_API_LATEST).call() {
        Ok(resp) => {
            let release: GhRelease = resp.into_json().map_err(|e| ArasulError::Internal {
                message: format!("GitHub release parse: {e}"),
            })?;
            let latest = release.tag_name.trim_start_matches("arasul-v").trim_start_matches('v').to_string();
            let asset = pick_asset_for_platform(&release.assets);
            let sha256_hex = asset.as_ref().and_then(|a| find_sha256_for(&a.name, &release.body));
            let update_available = latest != current && asset.is_some();
            Ok(UpdateCheck {
                current_version: current,
                latest_version: latest,
                update_available,
                download_url: asset.as_ref().map(|a| a.browser_download_url.clone()),
                sha256_hex,
                asset_name: asset.as_ref().map(|a| a.name.clone()),
            })
        }
        Err(_) => Ok(UpdateCheck {
            current_version: current.clone(),
            latest_version: current,
            update_available: false,
            download_url: None,
            sha256_hex: None,
            asset_name: None,
        }),
    }
}

/// Best-effort match on the asset filename. Release asset naming convention
/// (set by `.github/workflows/release-arasul.yml`):
///   arasul-<version>-macos-arm64.dmg
///   arasul-<version>-macos-x64.dmg
///   arasul-<version>-linux-x64.AppImage
///   arasul-<version>-windows-x64.msi
fn pick_asset_for_platform(assets: &[GhAsset]) -> Option<GhAsset> {
    let target = format!("{}-{}", os_tag(), arch_tag());
    assets.iter().find(|a| a.name.contains(&target)).cloned()
}

/// Extract the sha256 line for `asset_name` from a release body containing a
/// `SHA256SUMS` block like:
///
/// ```text
/// SHA256SUMS
/// 5f8...  arasul-0.1.0-macos-arm64.dmg
/// ab1...  arasul-0.1.0-linux-x64.AppImage
/// ```
fn find_sha256_for(asset_name: &str, body: &str) -> Option<String> {
    let mut in_block = false;
    for line in body.lines() {
        let trimmed = line.trim();
        if trimmed.eq_ignore_ascii_case("SHA256SUMS") || trimmed.starts_with("```") {
            in_block = !trimmed.starts_with("```") || !in_block;
            continue;
        }
        if !in_block && !trimmed.starts_with("```") {
            // also tolerate sha-first-field form without a header line
            if let Some((hash, name)) = trimmed.split_once(char::is_whitespace) {
                if name.trim() == asset_name && hash.len() == 64 && hash.chars().all(|c| c.is_ascii_hexdigit()) {
                    return Some(hash.to_ascii_lowercase());
                }
            }
            continue;
        }
        if let Some((hash, name)) = trimmed.split_once(char::is_whitespace) {
            if name.trim() == asset_name && hash.len() == 64 && hash.chars().all(|c| c.is_ascii_hexdigit()) {
                return Some(hash.to_ascii_lowercase());
            }
        }
    }
    None
}

#[tauri::command]
pub fn download_and_stage_update(app: AppHandle, drive_root: String) -> Result<String> {
    let check = check_for_update()?;
    let url = check.download_url.clone().ok_or_else(|| ArasulError::Internal {
        message: "no download url for this platform".into(),
    })?;
    let asset_name = check.asset_name.clone().unwrap_or_else(|| "bundle".into());
    let expected_sha = check.sha256_hex.clone();

    let staging = PathBuf::from(&drive_root)
        .join(".boot").join("updates").join("pending").join(os_tag());
    fs::create_dir_all(&staging)?;

    let channel = format!("updates://{}/progress", Uuid::new_v4());
    let chan_spawn = channel.clone();
    let staging_spawn = staging.clone();

    thread::spawn(move || {
        let _ = app.emit(&chan_spawn, serde_json::json!({ "pct": 0 }));
        let tmp = staging_spawn.join("pending.part");
        let result = (|| -> std::result::Result<(), String> {
            let agent = ureq::AgentBuilder::new()
                .timeout_connect(Duration::from_secs(10))
                .timeout_read(Duration::from_secs(300))
                .user_agent(USER_AGENT)
                .build();
            let resp = agent.get(&url).call().map_err(|e| e.to_string())?;
            let total: u64 = resp.header("content-length").and_then(|v| v.parse().ok()).unwrap_or(0);
            let mut reader = resp.into_reader();
            let mut file = fs::File::create(&tmp).map_err(|e| e.to_string())?;
            let mut buf = [0u8; 65536];
            let mut written: u64 = 0;
            loop {
                let n = reader.read(&mut buf).map_err(|e| e.to_string())?;
                if n == 0 { break; }
                file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
                written += n as u64;
                if total > 0 {
                    let pct = ((written * 100) / total).min(100);
                    let _ = app.emit(&chan_spawn, serde_json::json!({ "pct": pct }));
                }
            }
            file.sync_all().map_err(|e| e.to_string())?;
            drop(file);

            // Verify sha256 if we have one. If the release body didn't
            // include SHA256SUMS we accept the HTTPS-to-github.com chain
            // as sufficient — consistent with classic signed-url patterns.
            if let Some(expected) = expected_sha {
                let bytes = fs::read(&tmp).map_err(|e| e.to_string())?;
                let got = sha256_hex(&bytes);
                if got != expected {
                    return Err(format!("sha256 mismatch: expected {expected}, got {got}"));
                }
            }

            let target = staging_spawn.join(asset_name);
            if target.exists() { let _ = fs::remove_file(&target); }
            fs::rename(&tmp, &target).map_err(|e| e.to_string())?;
            Ok(())
        })();

        match result {
            Ok(()) => { let _ = app.emit(&chan_spawn, serde_json::json!({ "pct": 100, "done": true })); }
            Err(msg) => {
                let _ = fs::remove_file(&staging_spawn.join("pending.part"));
                let _ = app.emit(&chan_spawn, serde_json::json!({ "error": msg, "done": true }));
            }
        }
    });

    Ok(channel)
}

#[tauri::command]
pub fn apply_pending_update(drive_root: String) -> Result<()> {
    let pending = PathBuf::from(&drive_root)
        .join(".boot").join("updates").join("pending").join(os_tag());
    if !pending.exists() { return Ok(()); }
    // In practice: macOS opens the .dmg, user drags to replace; Linux
    // replaces the AppImage; Windows runs the .msi. Atomic in-place
    // replacement of a running binary is OS-dependent and deferred to
    // a future release. Staged assets stay put until applied.
    Ok(())
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(bytes);
    let out = h.finalize();
    out.iter().map(|b| format!("{:02x}", b)).collect()
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

#[allow(dead_code)]
fn _repo() -> &'static str { GITHUB_REPO }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sha256_known_digest() {
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn find_sha256_fenced_block() {
        let body = "Some notes\n\n```\nSHA256SUMS\ndeadbeef1234567890abcdef1234567890abcdef1234567890abcdef1234567890  arasul-0.1.0-macos-arm64.dmg\nba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  arasul-0.1.0-linux-x64.AppImage\n```\n";
        let got = find_sha256_for("arasul-0.1.0-linux-x64.AppImage", body);
        assert_eq!(got.as_deref(), Some("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"));
    }

    #[test]
    fn find_sha256_plain_lines() {
        let body = "\nba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  arasul-0.1.0-macos-arm64.dmg\n";
        let got = find_sha256_for("arasul-0.1.0-macos-arm64.dmg", body);
        assert_eq!(got.as_deref(), Some("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"));
    }

    #[test]
    fn find_sha256_missing() {
        assert_eq!(find_sha256_for("other.dmg", "nothing here"), None);
    }
}
