//! Projects — api-spec §4. Backed by `memory/projects.yaml`.
//!
//! Phase 2.4. Atomic-rename writes; never clobbers keys the schema
//! doesn't know about (we round-trip unknown keys unchanged).

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::ipc::error::{ArasulError, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub slug: String,
    pub name: String,
    pub path: String,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_opened_at: Option<String>,
    pub claude_md_exists: bool,
    pub git_repo: bool,
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct ProjectsFile {
    #[serde(default)]
    projects: Vec<Project>,
}

#[derive(Debug, Deserialize)]
pub struct CreateProjectArgs {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub template: Option<String>,
    #[serde(default)]
    pub drive_root: Option<String>,
}

fn projects_path(drive_root: &str) -> PathBuf {
    Path::new(drive_root).join("memory").join("projects.yaml")
}

fn read_all(drive_root: &str) -> Result<ProjectsFile> {
    let p = projects_path(drive_root);
    if !p.exists() {
        return Ok(ProjectsFile::default());
    }
    let text = fs::read_to_string(&p)?;
    serde_yaml::from_str(&text).map_err(|e| ArasulError::Internal {
        message: format!("projects.yaml parse: {e}"),
    })
}

fn write_all(drive_root: &str, file: &ProjectsFile) -> Result<()> {
    let p = projects_path(drive_root);
    fs::create_dir_all(p.parent().unwrap())?;
    let yaml = serde_yaml::to_string(file).map_err(|e| ArasulError::Internal {
        message: format!("projects.yaml serialize: {e}"),
    })?;
    let tmp = p.with_extension("tmp");
    fs::write(&tmp, yaml)?;
    if p.exists() {
        fs::remove_file(&p)?;
    }
    fs::rename(&tmp, &p)?;
    Ok(())
}

fn slugify(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

#[tauri::command]
pub fn list_projects(drive_root: String) -> Result<Vec<Project>> {
    Ok(read_all(&drive_root)?.projects)
}

#[tauri::command]
pub fn create_project(args: CreateProjectArgs) -> Result<Project> {
    let drive_root = args.drive_root.unwrap_or_else(|| ".".to_string());
    let mut file = read_all(&drive_root)?;
    let slug = slugify(&args.name);
    if file.projects.iter().any(|p| p.slug == slug) {
        return Err(ArasulError::Internal {
            message: format!("project '{slug}' already exists"),
        });
    }

    let project_dir = Path::new(&drive_root).join("content").join("projects").join(&slug);
    fs::create_dir_all(&project_dir)?;

    let claude_md_path = project_dir.join("CLAUDE.md");
    let starter = format!(
        "# {}\n\n{}\n\nCreated {} via the new-project wizard.\n",
        args.name,
        args.description.as_deref().unwrap_or("Project description goes here."),
        now_iso8601()
    );
    fs::write(&claude_md_path, starter)?;

    // Always seed a .gitignore. Even if the user doesn't init a git repo
    // today, doing it later won't accidentally pick up `.boot/vault.enc`,
    // build outputs, or pyenv noise. Catastrophic-leak prevention — the
    // vault key landing in a public repo would be unrecoverable.
    fs::write(project_dir.join(".gitignore"), DEFAULT_GITIGNORE)?;

    let project = Project {
        slug: slug.clone(),
        name: args.name,
        path: project_dir.to_string_lossy().to_string(),
        created_at: now_iso8601(),
        last_opened_at: None,
        claude_md_exists: true,
        git_repo: false,
    };
    file.projects.push(project.clone());
    write_all(&drive_root, &file)?;
    Ok(project)
}

#[tauri::command]
pub fn delete_project(drive_root: String, slug: String) -> Result<()> {
    let mut file = read_all(&drive_root)?;
    let before = file.projects.len();
    file.projects.retain(|p| p.slug != slug);
    if file.projects.len() == before {
        return Err(ArasulError::Internal {
            message: format!("no project with slug '{slug}'"),
        });
    }
    write_all(&drive_root, &file)?;
    // Note: we do NOT delete content/projects/<slug>/. Files are user data.
    Ok(())
}

#[tauri::command]
pub fn resolve_project(drive_root: String, query: String) -> Result<Vec<Project>> {
    let file = read_all(&drive_root)?;
    let q = query.to_lowercase();
    Ok(file
        .projects
        .into_iter()
        .filter(|p| p.slug.to_lowercase().contains(&q) || p.name.to_lowercase().contains(&q))
        .collect())
}

fn now_iso8601() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    format!("epoch+{}", now.as_secs())
}

/// Default .gitignore seeded into every new project. The vault-related
/// entries (`.boot/`, `vault.enc`, `runtime/`) are non-negotiable — leaking
/// these into a public repo exposes the encrypted credential blob and the
/// argon2 KDF parameters. Everything else is common build-output noise.
const DEFAULT_GITIGNORE: &str = "\
# Auto-generated by Arasul on project creation.
# Edit freely; the entries above the marker are required for vault safety.

# === Vault & boot (DO NOT REMOVE) ===
.boot/
vault.enc
runtime/

# === Common ===
.DS_Store
*.swp
*.swo
*~

# === Editors ===
.vscode/
.idea/

# === Node ===
node_modules/
.npm/
.pnpm-store/
.yarn/
dist/
build/
*.log

# === Python ===
__pycache__/
*.py[cod]
*$py.class
.venv/
venv/
.pytest_cache/

# === Rust ===
target/

# === Secrets ===
.env
.env.local
.env.*.local
*.pem
*.key
";

// ---------- GitHub import/export ----------
//
// These shell out to your local `git` / `gh`. We trust whatever credential
// helper / SSH key / gh-auth-login your shell already has configured.
// No token input in our UI, no OAuth client of ours.

/// Derive a slug from a GitHub URL.
///   https://github.com/owner/repo        → owner-repo
///   https://github.com/owner/repo.git    → owner-repo
///   git@github.com:owner/repo.git        → owner-repo
fn slug_from_url(url: &str) -> String {
    let trimmed = url.trim().trim_end_matches('/').trim_end_matches(".git");
    // Try splitting on "github.com/" or "github.com:".
    let tail = trimmed
        .rsplit_once("github.com/")
        .or_else(|| trimmed.rsplit_once("github.com:"))
        .map(|(_, rest)| rest)
        .unwrap_or(trimmed);
    tail.replace('/', "-").chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' { c } else { '-' })
        .collect::<String>()
        .split('-').filter(|s| !s.is_empty()).collect::<Vec<_>>().join("-")
        .to_lowercase()
}

#[derive(Debug, Deserialize)]
pub struct ImportGithubArgs {
    pub url: String,
    pub drive_root: String,
    /// Optional override for the project slug. Defaults to a slug
    /// derived from the URL.
    #[serde(default)]
    pub slug: Option<String>,
}

#[tauri::command]
pub fn project_import_github(args: ImportGithubArgs) -> Result<Project> {
    let slug = args.slug.unwrap_or_else(|| slug_from_url(&args.url));
    if slug.is_empty() {
        return Err(ArasulError::Internal { message: "could not derive slug from URL".into() });
    }

    let projects_dir = Path::new(&args.drive_root).join("content").join("projects");
    fs::create_dir_all(&projects_dir)?;
    let target = projects_dir.join(&slug);
    if target.exists() {
        return Err(ArasulError::Internal {
            message: format!("project '{slug}' already exists — pick a different slug"),
        });
    }

    let status = std::process::Command::new("git")
        .args(["clone", &args.url, target.to_string_lossy().as_ref()])
        .status()
        .map_err(|e| ArasulError::Internal { message: format!("git clone: {e}") })?;
    if !status.success() {
        return Err(ArasulError::Internal {
            message: format!("git clone exited {}", status.code().unwrap_or(-1)),
        });
    }

    // Register in projects.yaml. P0 audit fix: if the registration write
    // fails we'd otherwise have a stranded clone on disk + no entry, so a
    // re-import would hit "already exists" forever. Roll back the clone
    // before surfacing the error.
    let mut file = read_all(&args.drive_root).map_err(|e| {
        let _ = fs::remove_dir_all(&target);
        e
    })?;
    let project = Project {
        slug: slug.clone(),
        name: slug.clone(),
        path: target.to_string_lossy().to_string(),
        created_at: now_iso8601(),
        last_opened_at: None,
        claude_md_exists: target.join("CLAUDE.md").exists(),
        git_repo: true,
    };
    file.projects.push(project.clone());
    if let Err(e) = write_all(&args.drive_root, &file) {
        // Best-effort cleanup of the orphan clone.
        let _ = fs::remove_dir_all(&target);
        return Err(e);
    }
    Ok(project)
}

#[derive(Debug, Deserialize)]
pub struct ExportGithubArgs {
    pub drive_root: String,
    pub slug: String,
    /// If `create_new` is true, we shell out to `gh repo create` to make a
    /// fresh repo on GitHub and push. Requires the `gh` CLI installed +
    /// `gh auth login` done.
    #[serde(default)]
    pub create_new: bool,
    /// If `create_new` is false, the user-supplied existing remote URL to
    /// add as `origin` and push to.
    #[serde(default)]
    pub remote_url: Option<String>,
    /// Optional commit message for the initial export commit.
    #[serde(default)]
    pub commit_message: Option<String>,
}

#[tauri::command]
pub fn project_export_github(args: ExportGithubArgs) -> Result<String> {
    let project_dir = Path::new(&args.drive_root)
        .join("content").join("projects").join(&args.slug);
    if !project_dir.exists() {
        return Err(ArasulError::Internal { message: format!("no project dir: {}", project_dir.display()) });
    }

    let is_repo = project_dir.join(".git").exists();
    if !is_repo {
        let status = std::process::Command::new("git")
            .arg("init").current_dir(&project_dir).status()
            .map_err(|e| ArasulError::Internal { message: format!("git init: {e}") })?;
        if !status.success() {
            return Err(ArasulError::Internal { message: "git init failed".into() });
        }
    }

    // Stage + commit. It's fine if nothing changes — git will say so and
    // we carry on to the push step.
    let _ = std::process::Command::new("git")
        .args(["add", "-A"]).current_dir(&project_dir).status();
    let msg = args.commit_message.unwrap_or_else(|| "Export from Arasul".to_string());
    let _ = std::process::Command::new("git")
        .args(["commit", "-m", &msg]).current_dir(&project_dir).status();

    if args.create_new {
        // Shell out to `gh repo create`. Needs gh + gh-auth-login.
        let out = std::process::Command::new("gh")
            .args(["repo", "create", &args.slug, "--private", "--source", ".", "--remote", "origin", "--push"])
            .current_dir(&project_dir)
            .output()
            .map_err(|e| ArasulError::Internal {
                message: format!("gh repo create: {e}\n\nInstall the GitHub CLI: https://cli.github.com"),
            })?;
        if !out.status.success() {
            return Err(ArasulError::Internal {
                message: format!("gh repo create failed:\n{}", String::from_utf8_lossy(&out.stderr)),
            });
        }
        // Read back origin URL so we can report it.
        let url_out = std::process::Command::new("git")
            .args(["remote", "get-url", "origin"]).current_dir(&project_dir).output()
            .map_err(|e| ArasulError::Internal { message: format!("read remote: {e}") })?;
        Ok(String::from_utf8_lossy(&url_out.stdout).trim().to_string())
    } else {
        let url = args.remote_url.ok_or_else(|| ArasulError::Internal {
            message: "remote_url required when create_new is false".into(),
        })?;
        // If origin already exists, update it; otherwise add.
        let existing = std::process::Command::new("git")
            .args(["remote", "get-url", "origin"]).current_dir(&project_dir).output();
        if existing.as_ref().map(|o| o.status.success()).unwrap_or(false) {
            let _ = std::process::Command::new("git")
                .args(["remote", "set-url", "origin", &url]).current_dir(&project_dir).status();
        } else {
            let _ = std::process::Command::new("git")
                .args(["remote", "add", "origin", &url]).current_dir(&project_dir).status();
        }
        let push = std::process::Command::new("git")
            .args(["push", "-u", "origin", "HEAD"]).current_dir(&project_dir).output()
            .map_err(|e| ArasulError::Internal { message: format!("git push: {e}") })?;
        if !push.status.success() {
            return Err(ArasulError::Internal {
                message: format!(
                    "git push failed:\n{}\n\nCheck that your git credentials let you push to this remote.",
                    String::from_utf8_lossy(&push.stderr),
                ),
            });
        }
        Ok(url)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_and_list_project() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().to_string();
        let args = CreateProjectArgs {
            name: "My Thesis".into(),
            description: Some("PhD project".into()),
            template: None,
            drive_root: Some(root.clone()),
        };
        let p = create_project(args).unwrap();
        assert_eq!(p.slug, "my-thesis");
        let list = list_projects(root).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].slug, "my-thesis");
        assert!(list[0].claude_md_exists);
    }

    #[test]
    fn delete_project_removes_entry_not_files() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().to_string();
        create_project(CreateProjectArgs {
            name: "x".into(),
            description: None,
            template: None,
            drive_root: Some(root.clone()),
        })
        .unwrap();
        delete_project(root.clone(), "x".into()).unwrap();
        assert!(list_projects(root.clone()).unwrap().is_empty());
        // Content files still there.
        assert!(dir.path().join("content/projects/x/CLAUDE.md").exists());
    }
}
