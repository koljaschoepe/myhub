//! Search-across-files — shells out to `rg` (ripgrep) when present,
//! falls back to a slow grep-equivalent walk when not.
//!
//! Output is capped at 1000 hits to keep the UI snappy.

use std::path::Path;
use std::process::Command;

use serde::{Deserialize, Serialize};

use crate::ipc::error::{ArasulError, Result};

#[derive(Debug, Deserialize)]
pub struct SearchArgs {
    pub root: String,
    pub query: String,
    #[serde(default)]
    pub case_sensitive: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct SearchHit {
    pub path: String,
    pub line: u32,
    pub col: u32,
    pub text: String,
}

const MAX_HITS: usize = 1000;

#[tauri::command]
pub fn search_in_project(args: SearchArgs) -> Result<Vec<SearchHit>> {
    let q = args.query.trim();
    if q.is_empty() { return Ok(Vec::new()); }
    if !Path::new(&args.root).exists() {
        return Err(ArasulError::Internal {
            message: format!("search root not found: {}", args.root),
        });
    }

    // Try ripgrep first — fast, respects .gitignore, handles unicode.
    if let Some(hits) = run_rg(&args.root, q, args.case_sensitive) {
        return Ok(hits);
    }

    // Fallback: naive walk + read. Slow on big trees but never empty-handed.
    Ok(naive_walk(&args.root, q, args.case_sensitive))
}

fn run_rg(root: &str, query: &str, case_sensitive: bool) -> Option<Vec<SearchHit>> {
    let mut cmd = Command::new("rg");
    cmd.args(["--column", "--line-number", "--no-heading", "--hidden", "--max-count", "200"]);
    if !case_sensitive { cmd.arg("-i"); }
    cmd.arg("--glob").arg("!.git").arg("--glob").arg("!node_modules").arg("--glob").arg("!target");
    cmd.arg("--").arg(query).arg(root);
    let out = cmd.output().ok()?;
    // rg exit 0 = matches, 1 = no matches (still success for us).
    if out.status.code().unwrap_or(2) > 1 { return None; }

    let mut hits = Vec::new();
    for line in String::from_utf8_lossy(&out.stdout).lines() {
        if let Some(hit) = parse_rg_line(line) {
            hits.push(hit);
            if hits.len() >= MAX_HITS { break; }
        }
    }
    Some(hits)
}

fn parse_rg_line(line: &str) -> Option<SearchHit> {
    // Format: <path>:<line>:<col>:<text>
    let mut iter = line.splitn(4, ':');
    let path = iter.next()?.to_string();
    let lineno: u32 = iter.next()?.parse().ok()?;
    let col: u32 = iter.next()?.parse().ok()?;
    let text = iter.next()?.to_string();
    Some(SearchHit { path, line: lineno, col, text })
}

fn naive_walk(root: &str, query: &str, case_sensitive: bool) -> Vec<SearchHit> {
    use walkdir::WalkDir;
    let needle_lc = query.to_lowercase();
    let mut hits = Vec::new();
    for entry in WalkDir::new(root).follow_links(false).into_iter().flatten() {
        if !entry.file_type().is_file() { continue; }
        let p = entry.path().to_string_lossy().to_string();
        if p.contains("/.git/") || p.contains("/node_modules/") { continue; }
        let Ok(text) = std::fs::read_to_string(entry.path()) else { continue; };
        for (i, line) in text.lines().enumerate() {
            let m = if case_sensitive {
                line.find(query).map(|c| c as u32)
            } else {
                line.to_lowercase().find(&needle_lc).map(|c| c as u32)
            };
            if let Some(col) = m {
                hits.push(SearchHit {
                    path: p.clone(),
                    line: (i + 1) as u32,
                    col: col + 1,
                    text: line.chars().take(200).collect(),
                });
                if hits.len() >= MAX_HITS { return hits; }
            }
        }
    }
    hits
}
