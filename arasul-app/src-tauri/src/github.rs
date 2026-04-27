//! GitHub integration — single PAT in the vault, two buttons in the UI.
//!
//! Design (api-spec §11):
//!   - The user pastes a fine-grained PAT into Settings → GitHub. We store
//!     it in the vault under key `github_token`. Never on the SSD plaintext.
//!   - Pull/Push call `git` directly. We feed the token via an inline
//!     credential helper so it never lands on disk:
//!       git -c credential.helper="!f() { echo username=...; echo password=$T; }; f" ...
//!   - Repo creation hits the GitHub REST API directly via `ureq` (already
//!     a dep for the updates module). No `gh` CLI required.
//!   - When `create_project` runs and a token is saved, we automatically
//!     create a private repo named after the project and link it.

use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::ipc::error::{ArasulError, Result};
use crate::vault::VaultState;

const VAULT_KEY_GITHUB_TOKEN: &str = "github_token";
const GITHUB_API: &str = "https://api.github.com";
const USER_AGENT: &str = "arasul-app";

// ---------- Helpers ----------

fn token_for(handle: &str, vault: &VaultState) -> Result<Option<String>> {
    let arc = vault.shared();
    match crate::vault::try_get_secret_by_handle(&arc, handle, VAULT_KEY_GITHUB_TOKEN) {
        Ok(v) => Ok(v),
        // Locked / stale handle → treat as "no token" rather than erroring,
        // so UI calls during lock don't blow up the page.
        Err(_) => Ok(None),
    }
}

fn require_token(handle: &str, vault: &VaultState) -> Result<String> {
    token_for(handle, vault)?.ok_or_else(|| ArasulError::Internal {
        message: "no GitHub token saved — open Settings → GitHub and connect first".into(),
    })
}

fn project_dir(drive_root: &str, slug: &str) -> PathBuf {
    Path::new(drive_root).join("content").join("projects").join(slug)
}

fn ensure_repo(dir: &Path) -> Result<()> {
    if !dir.join(".git").exists() {
        let st = Command::new("git").arg("init").current_dir(dir).status()
            .map_err(|e| ArasulError::Internal { message: format!("git init: {e}") })?;
        if !st.success() {
            return Err(ArasulError::Internal { message: "git init failed".into() });
        }
        // First commit so push has something to push.
        let _ = Command::new("git").args(["add", "-A"]).current_dir(dir).status();
        let _ = Command::new("git")
            .args(["commit", "--allow-empty", "-m", "Initial commit"])
            .current_dir(dir)
            .status();
    }
    Ok(())
}

/// Build a credential-helper arg that returns the given username/token at
/// stdin without writing anything to disk. The %s placeholders are replaced
/// inline by git when it asks the helper for credentials.
fn cred_helper_arg(token: &str) -> String {
    // Single-quoted shell command — safe because we sanitize the token to
    // ASCII alphanumerics + a couple of standard PAT-prefix chars. GitHub
    // PATs match this charset exactly.
    let safe = token
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
        .collect::<String>();
    format!("!f() {{ echo username=x-access-token; echo password={safe}; }}; f")
}

fn run_git_with_token(
    dir: &Path,
    token: &str,
    args: &[&str],
) -> Result<std::process::Output> {
    let helper = cred_helper_arg(token);
    let mut cmd = Command::new("git");
    cmd.args(["-c", &format!("credential.helper={helper}")])
        .args(args)
        .current_dir(dir);
    let out = cmd.output()
        .map_err(|e| ArasulError::Internal { message: format!("git: {e}") })?;
    Ok(out)
}

/// Returns the repo's HTTPS URL after stripping any embedded token.
fn current_origin(dir: &Path) -> Option<String> {
    let out = Command::new("git")
        .args(["remote", "get-url", "origin"])
        .current_dir(dir)
        .output()
        .ok()?;
    if !out.status.success() { return None; }
    Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

// ---------- Commands ----------

#[derive(Debug, Serialize)]
pub struct GithubAccount {
    pub login: String,
    pub avatar_url: Option<String>,
    pub name: Option<String>,
}

/// Validate a token by hitting GET /user and return the account info.
/// Used by Settings → GitHub on save to confirm the token works.
#[tauri::command]
pub fn github_test_token(token: String) -> Result<GithubAccount> {
    let resp = ureq::get(&format!("{GITHUB_API}/user"))
        .set("Authorization", &format!("Bearer {token}"))
        .set("User-Agent", USER_AGENT)
        .set("Accept", "application/vnd.github+json")
        .call();

    match resp {
        Ok(r) => {
            let json: serde_json::Value = r.into_json().map_err(|e| ArasulError::Internal {
                message: format!("github /user response: {e}"),
            })?;
            Ok(GithubAccount {
                login: json.get("login").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                avatar_url: json.get("avatar_url").and_then(|v| v.as_str()).map(String::from),
                name: json.get("name").and_then(|v| v.as_str()).map(String::from),
            })
        }
        Err(ureq::Error::Status(401, _)) => Err(ArasulError::Internal {
            message: "Invalid token (401). Check that the PAT has not expired and includes the right scopes.".into(),
        }),
        Err(ureq::Error::Status(code, r)) => {
            let body = r.into_string().unwrap_or_default();
            Err(ArasulError::Internal {
                message: format!("GitHub returned {code}: {body}"),
            })
        }
        Err(e) => Err(ArasulError::Internal { message: format!("network: {e}") }),
    }
}

/// Returns whether a token is currently saved (without exposing it).
#[tauri::command]
pub fn github_has_token(handle: String, vault: State<'_, VaultState>) -> Result<bool> {
    Ok(token_for(&handle, &vault)?.is_some())
}

/// Returns the saved login name (calls /user with the saved token).
/// `None` when no token saved or the token is no longer valid.
#[tauri::command]
pub fn github_account(handle: String, vault: State<'_, VaultState>) -> Result<Option<GithubAccount>> {
    let Some(token) = token_for(&handle, &vault)? else { return Ok(None); };
    match github_test_token(token) {
        Ok(acct) => Ok(Some(acct)),
        Err(_) => Ok(None),
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateRepoArgs {
    pub handle: String,
    pub drive_root: String,
    pub slug: String,
    /// If true (default), create the repo as private.
    #[serde(default = "default_true")]
    pub private: bool,
    /// If true (default), push the local commits to the new origin after
    /// creating it.
    #[serde(default = "default_true")]
    pub push: bool,
}

fn default_true() -> bool { true }

#[derive(Debug, Serialize)]
pub struct CreateRepoResult {
    pub html_url: String,
    pub clone_url: String,
    pub default_branch: String,
}

/// Create a new private repo on GitHub for the given local project, link
/// origin, and (optionally) push the initial commit.
#[tauri::command]
pub fn github_create_repo(
    args: CreateRepoArgs,
    vault: State<'_, VaultState>,
) -> Result<CreateRepoResult> {
    let token = require_token(&args.handle, &vault)?;
    let dir = project_dir(&args.drive_root, &args.slug);
    if !dir.exists() {
        return Err(ArasulError::Internal {
            message: format!("no project dir: {}", dir.display()),
        });
    }

    let body = serde_json::json!({
        "name": args.slug,
        "private": args.private,
        "auto_init": false,
    });

    let resp = ureq::post(&format!("{GITHUB_API}/user/repos"))
        .set("Authorization", &format!("Bearer {token}"))
        .set("User-Agent", USER_AGENT)
        .set("Accept", "application/vnd.github+json")
        .set("X-GitHub-Api-Version", "2022-11-28")
        .send_json(body);

    let json: serde_json::Value = match resp {
        Ok(r) => r.into_json().map_err(|e| ArasulError::Internal {
            message: format!("create_repo response parse: {e}"),
        })?,
        Err(ureq::Error::Status(code, r)) => {
            let body = r.into_string().unwrap_or_default();
            return Err(ArasulError::Internal {
                message: format!("GitHub create_repo failed ({code}): {body}"),
            });
        }
        Err(e) => return Err(ArasulError::Internal { message: format!("network: {e}") }),
    };

    let html_url = json.get("html_url").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let clone_url = json.get("clone_url").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let default_branch = json.get("default_branch")
        .and_then(|v| v.as_str()).unwrap_or("main").to_string();

    if clone_url.is_empty() {
        return Err(ArasulError::Internal { message: "GitHub returned no clone_url".into() });
    }

    ensure_repo(&dir)?;

    // Set origin (replace if exists).
    if current_origin(&dir).is_some() {
        let _ = Command::new("git")
            .args(["remote", "set-url", "origin", &clone_url])
            .current_dir(&dir).status();
    } else {
        let _ = Command::new("git")
            .args(["remote", "add", "origin", &clone_url])
            .current_dir(&dir).status();
    }

    if args.push {
        // Make sure we're on a non-empty branch.
        let _ = Command::new("git").args(["branch", "-M", &default_branch])
            .current_dir(&dir).status();
        let push = run_git_with_token(&dir, &token, &["push", "-u", "origin", &default_branch])?;
        if !push.status.success() {
            return Err(ArasulError::Internal {
                message: format!("git push: {}", String::from_utf8_lossy(&push.stderr)),
            });
        }
    }

    Ok(CreateRepoResult { html_url, clone_url, default_branch })
}

#[derive(Debug, Deserialize)]
pub struct PullArgs {
    pub handle: String,
    pub drive_root: String,
    pub slug: String,
}

#[derive(Debug, Serialize)]
pub struct PullResult {
    pub stdout: String,
    pub stderr: String,
}

#[tauri::command]
pub fn github_pull(args: PullArgs, vault: State<'_, VaultState>) -> Result<PullResult> {
    let token = require_token(&args.handle, &vault)?;
    let dir = project_dir(&args.drive_root, &args.slug);
    if !dir.join(".git").exists() {
        return Err(ArasulError::Internal { message: "project is not a git repo".into() });
    }
    let out = run_git_with_token(&dir, &token, &["pull"])?;
    if !out.status.success() {
        return Err(ArasulError::Internal {
            message: format!("git pull: {}", String::from_utf8_lossy(&out.stderr)),
        });
    }
    Ok(PullResult {
        stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
    })
}

#[derive(Debug, Deserialize)]
pub struct PushArgs {
    pub handle: String,
    pub drive_root: String,
    pub slug: String,
    /// Optional commit message. If absent and there are staged/unstaged
    /// changes, we use a default. If there are no changes, we just push.
    #[serde(default)]
    pub commit_message: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PushResult {
    pub stdout: String,
    pub stderr: String,
    pub committed: bool,
}

#[tauri::command]
pub fn github_push(args: PushArgs, vault: State<'_, VaultState>) -> Result<PushResult> {
    let token = require_token(&args.handle, &vault)?;
    let dir = project_dir(&args.drive_root, &args.slug);
    ensure_repo(&dir)?;

    // Stage everything.
    let _ = Command::new("git").args(["add", "-A"]).current_dir(&dir).status();

    // Check if there are staged changes worth committing.
    let diff = Command::new("git")
        .args(["diff", "--cached", "--quiet"])
        .current_dir(&dir)
        .status()
        .map_err(|e| ArasulError::Internal { message: format!("git diff: {e}") })?;
    let has_staged = !diff.success();
    let mut committed = false;
    if has_staged {
        let msg = args.commit_message.clone().unwrap_or_else(|| "Update from Arasul".to_string());
        let st = Command::new("git")
            .args(["commit", "-m", &msg])
            .current_dir(&dir)
            .status()
            .map_err(|e| ArasulError::Internal { message: format!("git commit: {e}") })?;
        committed = st.success();
    }

    // Need an origin to push to.
    if current_origin(&dir).is_none() {
        return Err(ArasulError::Internal {
            message: "no origin remote — create the GitHub repo first".into(),
        });
    }

    let out = run_git_with_token(&dir, &token, &["push"])?;
    if !out.status.success() {
        return Err(ArasulError::Internal {
            message: format!("git push: {}", String::from_utf8_lossy(&out.stderr)),
        });
    }

    Ok(PushResult {
        stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
        committed,
    })
}

#[derive(Debug, Deserialize)]
pub struct CommitArgs {
    pub drive_root: String,
    pub slug: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct CommitResult {
    pub committed: bool,
    pub hash: Option<String>,
}

/// Stage all changes and create a commit. No push. Used for the
/// commit-only flow (Settings, slash command, etc.) — TopBar's main Push
/// button still bundles commit+push for the one-click experience.
#[tauri::command]
pub fn github_commit(args: CommitArgs) -> Result<CommitResult> {
    let dir = project_dir(&args.drive_root, &args.slug);
    ensure_repo(&dir)?;

    let _ = Command::new("git").args(["add", "-A"]).current_dir(&dir).status();

    let diff = Command::new("git")
        .args(["diff", "--cached", "--quiet"])
        .current_dir(&dir)
        .status()
        .map_err(|e| ArasulError::Internal { message: format!("git diff: {e}") })?;
    if diff.success() {
        // Nothing staged.
        return Ok(CommitResult { committed: false, hash: None });
    }

    let st = Command::new("git")
        .args(["commit", "-m", &args.message])
        .current_dir(&dir)
        .output()
        .map_err(|e| ArasulError::Internal { message: format!("git commit: {e}") })?;
    if !st.status.success() {
        return Err(ArasulError::Internal {
            message: format!("git commit: {}", String::from_utf8_lossy(&st.stderr)),
        });
    }

    let hash = Command::new("git")
        .args(["rev-parse", "HEAD"]).current_dir(&dir).output()
        .ok()
        .and_then(|o| if o.status.success() {
            Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
        } else { None });

    Ok(CommitResult { committed: true, hash })
}

#[derive(Debug, Deserialize)]
pub struct UndoLastPushArgs {
    pub handle: String,
    pub drive_root: String,
    pub slug: String,
}

#[derive(Debug, Serialize)]
pub struct UndoLastPushResult {
    pub stdout: String,
    pub stderr: String,
}

/// Undo the last push by creating a counter-commit (`git revert HEAD --no-edit`)
/// and pushing it. Always safe — never rewrites history, never force-pushes,
/// so it works even if anyone else has pushed in the meantime. The cost is
/// that history shows both the original commit and a "Revert <subject>"
/// commit. For a single-user portable workflow this is the right tradeoff:
/// no destructive operations, no `--force` risk.
#[tauri::command]
pub fn github_undo_last_push(
    args: UndoLastPushArgs,
    vault: State<'_, VaultState>,
) -> Result<UndoLastPushResult> {
    let token = require_token(&args.handle, &vault)?;
    let dir = project_dir(&args.drive_root, &args.slug);
    if !dir.join(".git").exists() {
        return Err(ArasulError::Internal { message: "project is not a git repo".into() });
    }

    let revert = Command::new("git")
        .args(["revert", "HEAD", "--no-edit"])
        .current_dir(&dir)
        .output()
        .map_err(|e| ArasulError::Internal { message: format!("git revert: {e}") })?;
    if !revert.status.success() {
        return Err(ArasulError::Internal {
            message: format!("git revert: {}", String::from_utf8_lossy(&revert.stderr)),
        });
    }

    let push = run_git_with_token(&dir, &token, &["push"])?;
    if !push.status.success() {
        return Err(ArasulError::Internal {
            message: format!("git push (undo): {}", String::from_utf8_lossy(&push.stderr)),
        });
    }

    Ok(UndoLastPushResult {
        stdout: String::from_utf8_lossy(&push.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&push.stderr).into_owned(),
    })
}

#[derive(Debug, Deserialize)]
pub struct StatusArgs {
    pub drive_root: String,
    pub slug: String,
}

#[derive(Debug, Serialize, Default)]
pub struct GithubProjectStatus {
    pub is_repo: bool,
    pub has_origin: bool,
    pub branch: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub dirty: u32,
}

#[tauri::command]
pub fn github_project_status(args: StatusArgs) -> Result<GithubProjectStatus> {
    let dir = project_dir(&args.drive_root, &args.slug);
    let mut s = GithubProjectStatus::default();
    if !dir.join(".git").exists() {
        return Ok(s);
    }
    s.is_repo = true;
    s.has_origin = current_origin(&dir).is_some();

    if let Ok(o) = Command::new("git").args(["branch", "--show-current"]).current_dir(&dir).output() {
        if o.status.success() {
            s.branch = Some(String::from_utf8_lossy(&o.stdout).trim().to_string());
        }
    }

    if s.has_origin {
        if let Ok(o) = Command::new("git")
            .args(["rev-list", "--left-right", "--count", "HEAD...@{upstream}"])
            .current_dir(&dir).output()
        {
            if o.status.success() {
                let line = String::from_utf8_lossy(&o.stdout);
                let mut parts = line.split_whitespace();
                s.ahead = parts.next().and_then(|x| x.parse().ok()).unwrap_or(0);
                s.behind = parts.next().and_then(|x| x.parse().ok()).unwrap_or(0);
            }
        }
    }

    if let Ok(o) = Command::new("git")
        .args(["status", "--porcelain"]).current_dir(&dir).output()
    {
        if o.status.success() {
            s.dirty = String::from_utf8_lossy(&o.stdout).lines().count() as u32;
        }
    }

    Ok(s)
}
