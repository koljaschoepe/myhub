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
    /// Phase 5.4: treat `query` as a regex. When false (default), the
    /// pattern is escaped via ripgrep's `--fixed-strings` so users can
    /// type `foo.md` and find `foo.md` instead of any `foo` + any char
    /// + `md`.
    #[serde(default)]
    pub regex: bool,
    /// Phase 5.4: match whole words only.
    #[serde(default)]
    pub whole_word: bool,
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
    if let Some(hits) = run_rg(&args.root, q, args.case_sensitive, args.regex, args.whole_word) {
        return Ok(hits);
    }

    // Fallback: naive walk + read. Slow on big trees but never empty-handed.
    // Naive path supports literal substring + whole-word; regex falls back
    // to literal substring (the fallback is rarely hit in practice).
    Ok(naive_walk(&args.root, q, args.case_sensitive, args.whole_word))
}

fn run_rg(
    root: &str,
    query: &str,
    case_sensitive: bool,
    regex: bool,
    whole_word: bool,
) -> Option<Vec<SearchHit>> {
    let mut cmd = Command::new("rg");
    cmd.args(["--column", "--line-number", "--no-heading", "--hidden", "--max-count", "200"]);
    if !case_sensitive { cmd.arg("-i"); }
    if !regex { cmd.arg("--fixed-strings"); }
    if whole_word { cmd.arg("--word-regexp"); }
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

fn naive_walk(root: &str, query: &str, case_sensitive: bool, whole_word: bool) -> Vec<SearchHit> {
    use walkdir::WalkDir;
    let needle_lc = query.to_lowercase();
    let mut hits = Vec::new();
    // Word-boundary check: a "word char" here matches ripgrep's
    // default (\w = [A-Za-z0-9_]).
    let is_word = |c: char| c.is_alphanumeric() || c == '_';
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
            let Some(col) = m else { continue; };
            if whole_word {
                // Match must have non-word neighbours on both sides.
                let start = col as usize;
                let end = start + query.len();
                let left_ok = start == 0
                    || !line[..start].chars().rev().next().is_some_and(is_word);
                let right_ok = end >= line.len()
                    || !line[end..].chars().next().is_some_and(is_word);
                if !(left_ok && right_ok) { continue; }
            }
            hits.push(SearchHit {
                path: p.clone(),
                line: (i + 1) as u32,
                col: col + 1,
                text: line.chars().take(200).collect(),
            });
            if hits.len() >= MAX_HITS { return hits; }
        }
    }
    hits
}
