//! File import — drag-and-drop and "Import…" picker share the same Rust
//! command. Copies a file from anywhere on the host into the active
//! project's `content/` folder, atomically and with conflict resolution.
//!
//! Conflict policy:
//!   None  → error if target exists
//!   "replace"   → overwrite
//!   "keep-both" → append " (1)", " (2)", … to the basename until unique
//!
//! Path safety: we resolve target against the project dir and verify the
//! canonical path stays under it (never let a crafted filename escape via
//! `../`).

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::ipc::error::{ArasulError, Result};

#[derive(Debug, Deserialize)]
pub struct ImportFileArgs {
    pub src_path: String,
    pub drive_root: String,
    pub project_slug: String,
    /// Optional sub-directory within the project (e.g., "attachments/").
    /// If absent or empty, files land directly in the project root.
    #[serde(default)]
    pub subdir: Option<String>,
    #[serde(default)]
    pub on_conflict: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ImportFileResult {
    pub dest_path: String,
    pub renamed: bool,
}

#[tauri::command]
pub fn import_file(args: ImportFileArgs) -> Result<ImportFileResult> {
    let src = PathBuf::from(&args.src_path);
    if !src.exists() || !src.is_file() {
        return Err(ArasulError::Internal {
            message: format!("source not found or not a file: {}", src.display()),
        });
    }

    let project_dir = Path::new(&args.drive_root)
        .join("content").join("projects").join(&args.project_slug);
    if !project_dir.exists() {
        return Err(ArasulError::Internal {
            message: format!("project not found: {}", args.project_slug),
        });
    }

    let mut target_dir = project_dir.clone();
    if let Some(sub) = &args.subdir {
        let sub_clean = sub.trim().trim_start_matches('/').trim_end_matches('/');
        if !sub_clean.is_empty() && !sub_clean.contains("..") {
            target_dir = target_dir.join(sub_clean);
            fs::create_dir_all(&target_dir)?;
        }
    }

    let filename = src.file_name().ok_or_else(|| ArasulError::Internal {
        message: "source has no filename".into(),
    })?;
    let mut dest = target_dir.join(filename);
    let mut renamed = false;

    if dest.exists() {
        match args.on_conflict.as_deref() {
            Some("replace") => { /* overwrite */ }
            Some("keep-both") => {
                dest = unique_path(&dest);
                renamed = true;
            }
            _ => {
                return Err(ArasulError::Internal {
                    message: format!("file already exists: {}", dest.display()),
                });
            }
        }
    }

    // Defense-in-depth: target must stay under the project dir.
    if let (Ok(canon_target), Ok(canon_proj)) = (
        dest.canonicalize().or_else(|_| {
            // not yet existing — canonicalize parent then append.
            dest.parent().ok_or(std::io::Error::new(std::io::ErrorKind::Other, "no parent"))
                .and_then(|p| p.canonicalize())
                .map(|p| p.join(dest.file_name().unwrap_or_default()))
        }),
        project_dir.canonicalize(),
    ) {
        if !canon_target.starts_with(&canon_proj) {
            return Err(ArasulError::Internal {
                message: "import target escapes project directory".into(),
            });
        }
    }

    fs::copy(&src, &dest)?;

    Ok(ImportFileResult {
        dest_path: dest.to_string_lossy().to_string(),
        renamed,
    })
}

fn unique_path(p: &Path) -> PathBuf {
    let parent = p.parent().unwrap_or(Path::new("."));
    let stem = p.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let ext = p.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    for n in 1..=999 {
        let candidate = parent.join(format!("{stem} ({n}){ext}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    parent.join(format!("{stem} (copy){ext}"))
}
