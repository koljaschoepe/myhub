//! Auto-launch — api-spec §9 + plan §5.
//!
//! Phase 4.5-4.7.
//! - macOS: writes a LaunchAgent plist at `~/Library/LaunchAgents/` and
//!   runs `launchctl load`.
//! - Linux: writes systemd user unit + path file at `~/.config/systemd/user/`
//!   and runs `systemctl --user enable --now`.
//! - Windows: scaffolded — schtasks invocation is coded but untested from
//!   this host. Will need real Win CI to smoke-test in Phase 5.

use std::fs;
use std::path::PathBuf;

use crate::ipc::error::{ArasulError, Result};

const LABEL: &str = "de.unit-ix.arasul.mount";

pub fn is_installed() -> std::result::Result<bool, ArasulError> {
    #[cfg(target_os = "macos")] { Ok(macos::plist_path().exists()) }
    #[cfg(target_os = "linux")] { Ok(linux::path_unit_path().exists()) }
    #[cfg(target_os = "windows")] { Ok(false) }
}

#[tauri::command]
pub fn install_auto_launch() -> Result<()> {
    #[cfg(target_os = "macos")] { return macos::install(); }
    #[cfg(target_os = "linux")] { return linux::install(); }
    #[cfg(target_os = "windows")] { return windows::install(); }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    { Err(ArasulError::NotSupportedOnOs { os: std::env::consts::OS.to_string() }) }
}

#[tauri::command]
pub fn uninstall_auto_launch() -> Result<()> {
    #[cfg(target_os = "macos")] { return macos::uninstall(); }
    #[cfg(target_os = "linux")] { return linux::uninstall(); }
    #[cfg(target_os = "windows")] { return windows::uninstall(); }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    { Err(ArasulError::NotSupportedOnOs { os: std::env::consts::OS.to_string() }) }
}

#[tauri::command]
pub fn is_auto_launch_installed() -> Result<bool> {
    is_installed()
}

#[cfg(target_os = "macos")]
mod macos {
    use super::*;

    pub fn plist_path() -> PathBuf {
        dirs_home()
            .join("Library")
            .join("LaunchAgents")
            .join(format!("{LABEL}.plist"))
    }

    pub fn install() -> Result<()> {
        let plist = plist_path();
        fs::create_dir_all(plist.parent().unwrap())?;
        let arasul_app_path = std::env::current_exe()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| "/Applications/Arasul.app/Contents/MacOS/Arasul".into());

        let body = format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>{LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>{arasul_app_path}</string>
  </array>
  <key>StartOnMount</key>
  <true/>
  <key>RunAtLoad</key>
  <false/>
  <key>KeepAlive</key>
  <false/>
</dict>
</plist>
"#
        );
        fs::write(&plist, body)?;

        // Load into launchd — best-effort, ignore errors (e.g. already loaded).
        let _ = std::process::Command::new("launchctl")
            .args(["load", "-w", plist.to_string_lossy().as_ref()])
            .status();
        Ok(())
    }

    pub fn uninstall() -> Result<()> {
        let plist = plist_path();
        if plist.exists() {
            let _ = std::process::Command::new("launchctl")
                .args(["unload", plist.to_string_lossy().as_ref()])
                .status();
            fs::remove_file(&plist)?;
        }
        Ok(())
    }
}

#[cfg(target_os = "linux")]
mod linux {
    use super::*;

    pub fn path_unit_path() -> PathBuf {
        dirs_home()
            .join(".config")
            .join("systemd")
            .join("user")
            .join("arasul-mount.path")
    }

    fn service_unit_path() -> PathBuf {
        dirs_home()
            .join(".config")
            .join("systemd")
            .join("user")
            .join("arasul-mount.service")
    }

    pub fn install() -> Result<()> {
        let unit_dir = path_unit_path().parent().unwrap().to_path_buf();
        fs::create_dir_all(&unit_dir)?;

        let arasul_bin = std::env::current_exe()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| "/usr/local/bin/arasul".into());

        let path_unit = format!(
            "[Unit]\nDescription=Arasul drive watch\n\n[Path]\nPathExists=/run/media/%u/Arasul\nUnit=arasul-mount.service\n\n[Install]\nWantedBy=default.target\n",
        );
        let svc = format!(
            "[Unit]\nDescription=Arasul (portable AI workspace)\n\n[Service]\nType=forking\nExecStart={arasul_bin}\n\n[Install]\nWantedBy=default.target\n",
        );
        fs::write(path_unit_path(), path_unit)?;
        fs::write(service_unit_path(), svc)?;

        let _ = std::process::Command::new("systemctl")
            .args(["--user", "enable", "--now", "arasul-mount.path"])
            .status();
        Ok(())
    }

    pub fn uninstall() -> Result<()> {
        let _ = std::process::Command::new("systemctl")
            .args(["--user", "disable", "--now", "arasul-mount.path"])
            .status();
        let _ = fs::remove_file(path_unit_path());
        let _ = fs::remove_file(service_unit_path());
        Ok(())
    }
}

#[cfg(target_os = "windows")]
mod windows {
    use super::*;

    pub fn install() -> Result<()> {
        let arasul_exe = std::env::current_exe()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| "C:\\Program Files\\Arasul\\arasul.exe".into());

        // Kernel-PnP Event ID 20001 triggers a volume-label-filtered task.
        // See docs/auto-launch-windows.md for the filter XML; this command
        // is approximate and needs real Windows smoke-testing (Phase 5).
        let _ = std::process::Command::new("schtasks")
            .args([
                "/create", "/tn", "Arasul Mount",
                "/tr", &format!("\"{arasul_exe}\""),
                "/sc", "onevent",
                "/ec", "Microsoft-Windows-Kernel-PnP/Device Configuration",
                "/mo", "*[System[EventID=20001]]",
                "/f",
            ])
            .status();
        Ok(())
    }

    pub fn uninstall() -> Result<()> {
        let _ = std::process::Command::new("schtasks")
            .args(["/delete", "/tn", "Arasul Mount", "/f"])
            .status();
        Ok(())
    }
}

fn dirs_home() -> PathBuf {
    std::env::var("HOME")
        .ok()
        .map(PathBuf::from)
        .or_else(|| std::env::var("USERPROFILE").ok().map(PathBuf::from))
        .unwrap_or_else(|| PathBuf::from("."))
}
