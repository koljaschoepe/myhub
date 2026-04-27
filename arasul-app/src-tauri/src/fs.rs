//! Filesystem — api-spec §3 implementation.
//!
//! Phase 1.2 + 2.1. All paths must resolve under a configured drive root,
//! which is set once at app start. Until DriveWatcher (1.8) is live, the
//! root is taken from the client on each call.
//!
//! Atomic write: `tmp-XXXX.part` → `fsync` → `rename`. On macOS we also
//! call `F_FULLFSYNC` to force a drive-level flush; on other platforms
//! `sync_all` is sufficient.

use std::collections::HashSet;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use ignore::gitignore::{Gitignore, GitignoreBuilder};
use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

use crate::ipc::error::{ArasulError, Result};

/// Walk up from `start` looking for the nearest `.gitignore`. Returns
/// the parsed Gitignore and the directory that owns it. Empty matcher
/// when nothing is found — match calls are still cheap.
fn load_gitignore(start: &Path) -> (Gitignore, PathBuf) {
    let mut probe = start.to_path_buf();
    loop {
        let candidate = probe.join(".gitignore");
        if candidate.is_file() {
            let mut b = GitignoreBuilder::new(&probe);
            let _ = b.add(&candidate);
            if let Ok(gi) = b.build() {
                return (gi, probe);
            }
        }
        match probe.parent() {
            Some(par) => probe = par.to_path_buf(),
            None => return (Gitignore::empty(), start.to_path_buf()),
        }
    }
}

const DEFAULT_FILTER: &[&str] = &[
    ".git",
    ".DS_Store",
    "node_modules",
    "target",
    ".Trashes",
    ".Spotlight-V100",
    ".fseventsd",
    ".TemporaryItems",
];

#[derive(Debug, Serialize, Deserialize)]
pub struct FilteredNode {
    pub name: String,
    pub path: String,
    pub kind: String,
    pub size_bytes: Option<u64>,
    pub mtime: Option<String>,
    pub is_hidden: bool,
    pub children: Option<Vec<FilteredNode>>,
}

#[derive(Debug, Default, Deserialize)]
pub struct ListTreeOptions {
    pub show_hidden: Option<bool>,
}

#[tauri::command]
pub fn list_tree(path: String, options: Option<ListTreeOptions>) -> Result<Vec<FilteredNode>> {
    let opts = options.unwrap_or_default();
    let show_hidden = opts.show_hidden.unwrap_or(false);
    let filter = load_filter(&path).unwrap_or_else(default_filter_set);

    let root = PathBuf::from(&path);
    if !root.exists() {
        return Err(ArasulError::FsIo { message: format!("path does not exist: {path}") });
    }

    // Load the nearest enclosing .gitignore once per call so per-entry
    // matching is O(1). User can opt out via show_hidden=true.
    let (gi, _gi_root) = load_gitignore(&root);

    let mut out = Vec::new();
    let walker = WalkDir::new(&root).max_depth(1).follow_links(false).into_iter();
    for entry in walker.filter_entry(|e| e.path() == root || !filter.contains(e.file_name().to_string_lossy().as_ref())) {
        let entry = match entry { Ok(e) => e, Err(_) => continue };
        if entry.path() == root { continue; }
        let name = entry.file_name().to_string_lossy().to_string();
        let is_hidden = name.starts_with('.');
        if is_hidden && !show_hidden { continue; }
        let is_dir = entry.file_type().is_dir();
        if !show_hidden && gi.matched(entry.path(), is_dir).is_ignore() { continue; }

        let kind = if entry.file_type().is_dir() { "dir" } else { "file" };
        let md = entry.metadata().ok();
        let size_bytes = md.as_ref().and_then(|m| if m.is_file() { Some(m.len()) } else { None });
        let mtime = md.as_ref().and_then(|m| m.modified().ok())
            .map(|t| {
                // Simple ISO-8601 approximation via epoch seconds — good enough for UI.
                let dur = t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
                format!("1970-01-01T00:00:00Z+{}", dur.as_secs())
            });
        out.push(FilteredNode {
            name,
            path: entry.path().to_string_lossy().to_string(),
            kind: kind.into(),
            size_bytes,
            mtime,
            is_hidden,
            children: None,
        });
    }

    out.sort_by(|a, b| match (a.kind.as_str(), b.kind.as_str()) {
        ("dir", "file") => std::cmp::Ordering::Less,
        ("file", "dir") => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(out)
}

fn load_filter(root: &str) -> Option<HashSet<String>> {
    // Tree filter lives at $root/.boot/tree-filter.json.
    // Honored when present; falls back to DEFAULT_FILTER.
    let p = Path::new(root).join(".boot").join("tree-filter.json");
    let text = fs::read_to_string(&p).ok()?;
    let list: Vec<String> = serde_json::from_str(&text).ok()?;
    Some(list.into_iter().collect())
}

fn default_filter_set() -> HashSet<String> {
    DEFAULT_FILTER.iter().map(|s| s.to_string()).collect()
}

/// Flat list of every file in the project (for ⌘P fuzzy finder). Skips
/// the same default ignores as `list_tree` (.git, node_modules, etc.)
/// PLUS any .gitignore patterns from the project root.
/// Caps at 5000 results so an accidentally huge folder doesn't lock the UI.
#[tauri::command]
pub fn list_project_files(root: String) -> Result<Vec<String>> {
    let filter = load_filter(&root).unwrap_or_else(default_filter_set);
    let root_path = PathBuf::from(&root);
    let (gi, _) = load_gitignore(&root_path);
    let mut out: Vec<String> = Vec::new();
    let walker = WalkDir::new(&root).follow_links(false).into_iter();
    for entry in walker.filter_entry(|e| {
        if e.path().to_string_lossy() == root { return true; }
        let name_owned = e.file_name().to_string_lossy().to_string();
        if filter.contains(name_owned.as_str()) { return false; }
        let is_dir = e.file_type().is_dir();
        !gi.matched(e.path(), is_dir).is_ignore()
    }) {
        let entry = match entry { Ok(e) => e, Err(_) => continue };
        if !entry.file_type().is_file() { continue; }
        if entry.file_name().to_string_lossy().starts_with('.') { continue; }
        out.push(entry.path().to_string_lossy().to_string());
        if out.len() >= 5000 { break; }
    }
    Ok(out)
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String> {
    fs::read_to_string(&path).map_err(|e| e.into())
}

/// Binary read for the multi-format viewer (PDF, images, audio, video).
/// Returns base64 — Tauri IPC strips zero bytes from raw byte arrays
/// in some configurations and base64 sidesteps that entirely.
#[tauri::command]
pub fn read_file_bytes(path: String) -> Result<String> {
    use base64::Engine as _;
    let bytes = fs::read(&path)?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}

/// Atomic-rename write. Durable flush on macOS (F_FULLFSYNC).
#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<()> {
    let target = PathBuf::from(&path);
    let parent = target.parent().ok_or_else(|| ArasulError::FsIo {
        message: format!("no parent dir: {path}"),
    })?;
    fs::create_dir_all(parent)?;

    let tmp = parent.join(format!(
        ".{}.arasul-{}.part",
        target.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
        uuid::Uuid::new_v4().simple()
    ));

    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(content.as_bytes())?;
        f.sync_all()?;

        #[cfg(target_os = "macos")]
        {
            use std::os::unix::io::AsRawFd;
            // F_FULLFSYNC — macOS-specific strong durability guarantee.
            // Safe: fd is valid until f is dropped.
            unsafe {
                // F_FULLFSYNC = 51 on darwin.
                let _ = libc_fcntl(f.as_raw_fd(), 51);
            }
        }
    }

    // On Windows, fs::rename refuses to overwrite — mirror the vault's approach.
    if target.exists() {
        fs::remove_file(&target)?;
    }
    fs::rename(&tmp, &target)?;
    Ok(())
}

#[cfg(target_os = "macos")]
#[link(name = "c")]
extern "C" {
    #[link_name = "fcntl"]
    fn libc_fcntl(fd: i32, cmd: i32) -> i32;
}

#[tauri::command]
pub fn rename(src: String, dst: String) -> Result<()> {
    fs::rename(&src, &dst).map_err(|e| e.into())
}

/// Delete into the drive's `.Trashes/` rather than hard-deleting.
/// v1 uses a soft move; a Trash-aware implementation lands in Phase 2.3.
#[tauri::command]
pub fn delete(path: String) -> Result<()> {
    let p = PathBuf::from(&path);
    let name = p.file_name().ok_or_else(|| ArasulError::FsIo { message: "no filename".into() })?;
    let parent = p.parent().ok_or_else(|| ArasulError::FsIo { message: "no parent".into() })?;
    // Find the drive root by walking up to .boot/
    let mut probe = parent.to_path_buf();
    let trashes = loop {
        if probe.join(".boot").exists() { break probe.join(".Trashes").join("501"); }
        match probe.parent() {
            Some(par) => probe = par.to_path_buf(),
            None => break PathBuf::from("/tmp/arasul-trash"),
        }
    };
    fs::create_dir_all(&trashes)?;
    let dst = trashes.join(name);
    fs::rename(&p, &dst)?;
    Ok(())
}

#[tauri::command]
pub fn reveal_in_finder(path: String) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map_err(|e| ArasulError::FsIo { message: format!("open -R: {e}") })?;
        Ok(())
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer.exe")
            .arg(format!("/select,{path}"))
            .spawn()
            .map_err(|e| ArasulError::FsIo { message: format!("explorer: {e}") })?;
        Ok(())
    }
    #[cfg(target_os = "linux")]
    {
        let parent = std::path::Path::new(&path).parent().map(|p| p.to_path_buf()).unwrap_or_else(|| std::path::PathBuf::from("."));
        std::process::Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|e| ArasulError::FsIo { message: format!("xdg-open: {e}") })?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_then_read_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("note.md");
        write_file(p.to_string_lossy().to_string(), "hello arasul".into()).unwrap();
        let got = read_file(p.to_string_lossy().to_string()).unwrap();
        assert_eq!(got, "hello arasul");
    }

    #[test]
    fn list_tree_returns_children_sorted() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("b.md"), "").unwrap();
        fs::write(dir.path().join("a.md"), "").unwrap();
        fs::create_dir(dir.path().join("zzz-dir")).unwrap();
        let out = list_tree(dir.path().to_string_lossy().to_string(), None).unwrap();
        let names: Vec<_> = out.iter().map(|n| n.name.as_str()).collect();
        assert_eq!(names, vec!["zzz-dir", "a.md", "b.md"]);
    }

    #[test]
    fn list_tree_filters_defaults() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir(dir.path().join(".git")).unwrap();
        fs::create_dir(dir.path().join("node_modules")).unwrap();
        fs::write(dir.path().join("ok.md"), "").unwrap();
        let out = list_tree(dir.path().to_string_lossy().to_string(), None).unwrap();
        let names: Vec<_> = out.iter().map(|n| n.name.as_str()).collect();
        assert_eq!(names, vec!["ok.md"]);
    }
}
