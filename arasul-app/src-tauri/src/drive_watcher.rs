//! DriveWatcher — Phase 1.8.
//!
//! Per-OS mount/eject detection. macOS: DiskArbitration (callback-based).
//! Linux: inotify on `/proc/mounts` or `udev` (lightweight implementation
//! here polls `/proc/mounts`). Windows: `WM_DEVICECHANGE` (not wired in
//! scaffold — placeholder that emits no events).
//!
//! Emits two events on the Tauri app handle:
//!   `drive://mounted`   { mount_point: string, label: string }
//!   `drive://ejected`   { mount_point: string }
//!
//! The frontend listens and updates `SessionProvider.driveRoot`.

use std::sync::Arc;
use std::thread;
use std::time::Duration;

use parking_lot::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Clone, Serialize)]
pub struct DriveMountedEvent {
    pub mount_point: String,
    pub label: String,
}

#[derive(Clone, Serialize)]
pub struct DriveEjectedEvent {
    pub mount_point: String,
}

/// Kick off OS-appropriate watcher. Safe to call once at startup; additional
/// calls are no-ops.
pub fn start(app: AppHandle) {
    static STARTED: Mutex<bool> = Mutex::new(false);
    let mut g = STARTED.lock();
    if *g { return; }
    *g = true;
    drop(g);

    #[cfg(target_os = "macos")]
    macos::start(app);

    #[cfg(target_os = "linux")]
    linux::start(app);

    #[cfg(target_os = "windows")]
    windows::start(app);
}

#[cfg(target_os = "macos")]
mod macos {
    use super::*;
    use std::collections::HashSet;
    use std::path::PathBuf;

    /// Phase 1.8 scaffold on macOS: poll /Volumes every second.
    /// Real DiskArbitration + event-driven callback lands in Phase 2
    /// (needs proper core-foundation run-loop on a dedicated thread).
    pub fn start(app: AppHandle) {
        thread::spawn(move || {
            let mut seen: HashSet<String> = fs_volumes().into_iter().collect();
            loop {
                thread::sleep(Duration::from_secs(1));
                let now: HashSet<String> = fs_volumes().into_iter().collect();
                for mount in now.difference(&seen) {
                    let label = PathBuf::from(mount)
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();
                    let _ = app.emit(
                        "drive://mounted",
                        DriveMountedEvent { mount_point: mount.clone(), label },
                    );
                }
                for mount in seen.difference(&now) {
                    let _ = app.emit(
                        "drive://ejected",
                        DriveEjectedEvent { mount_point: mount.clone() },
                    );
                }
                seen = now;
            }
        });
    }

    fn fs_volumes() -> Vec<String> {
        std::fs::read_dir("/Volumes")
            .ok()
            .into_iter()
            .flatten()
            .filter_map(|e| e.ok())
            .map(|e| e.path().to_string_lossy().to_string())
            .collect()
    }
}

#[cfg(target_os = "linux")]
mod linux {
    use super::*;
    use std::collections::HashSet;

    pub fn start(app: AppHandle) {
        thread::spawn(move || {
            let mut seen: HashSet<String> = mounts().into_iter().collect();
            loop {
                thread::sleep(Duration::from_secs(1));
                let now: HashSet<String> = mounts().into_iter().collect();
                for mp in now.difference(&seen) {
                    let label = std::path::Path::new(mp)
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();
                    let _ = app.emit("drive://mounted", DriveMountedEvent { mount_point: mp.clone(), label });
                }
                for mp in seen.difference(&now) {
                    let _ = app.emit("drive://ejected", DriveEjectedEvent { mount_point: mp.clone() });
                }
                seen = now;
            }
        });
    }

    fn mounts() -> Vec<String> {
        let text = std::fs::read_to_string("/proc/mounts").unwrap_or_default();
        text.lines()
            .filter_map(|line| {
                let mut parts = line.split_whitespace();
                let _dev = parts.next()?;
                let mp = parts.next()?;
                if mp.starts_with("/media") || mp.starts_with("/mnt") || mp.starts_with("/run/media") {
                    Some(mp.to_string())
                } else {
                    None
                }
            })
            .collect()
    }
}

#[cfg(target_os = "windows")]
mod windows {
    use super::*;
    pub fn start(_app: AppHandle) {
        // TODO: Phase 1.8 proper — subscribe to WM_DEVICECHANGE via a hidden
        // window + window-proc. Scaffold only for now.
    }
}

// Silence warnings on unused Arc import on platforms that don't use it.
#[allow(dead_code)]
fn _keep_arc<T>(_: Arc<T>) {}
