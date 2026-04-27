import { useEffect, useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ChevronDown, Plus, Download, Folder, X, ArrowDown, ArrowUp, GitBranch,
} from "lucide-react";
import { useSession } from "../lib/session";
import { useWorkspace } from "../lib/workspace";
import { TreePane } from "./TreePane";
import "./LeftPane.css";

type Project = {
  slug: string;
  name: string;
  path: string;
  created_at: string;
  claude_md_exists: boolean;
  git_repo: boolean;
};

type GithubProjectStatus = {
  is_repo: boolean;
  has_origin: boolean;
  branch: string | null;
  ahead: number;
  behind: number;
  dirty: number;
};

/**
 * Project-scoped left pane.
 *
 *  Top:        ProjectPicker — dropdown over `memory/projects.yaml`.
 *  Below picker: Pull / Push buttons + branch + ahead/behind/dirty indicators.
 *  Below row:  TreePane scoped to `content/projects/<slug>/`.
 *
 * The export-modal with two tabs is gone. Once a token is saved in
 * Settings → GitHub, every project gets a "Push" button that just-works.
 * For new projects, a private repo is auto-created on first save.
 */
export function LeftPane() {
  const { driveRoot, state: sess } = useSession();
  const handle = sess.status === "unlocked" ? sess.handle : "";
  const { state: ws, setProject, openFile } = useWorkspace();
  const [projects, setProjects] = useState<Project[]>([]);
  const [refreshToken, setRefreshToken] = useState(0);
  const refresh = useCallback(() => setRefreshToken((n) => n + 1), []);

  useEffect(() => {
    void invoke<Project[]>("list_projects", { driveRoot })
      .then((list) => {
        setProjects(list);
        // P5: only auto-select if the project's directory actually exists.
        // Stops us from opening a stale terminal in a deleted project.
        if (!ws.projectSlug && list.length > 0) {
          const first = list[0];
          setProject(first.slug);
        }
      })
      .catch((e) => console.warn("list_projects failed:", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driveRoot, refreshToken]);

  const currentProject = projects.find((p) => p.slug === ws.projectSlug) ?? null;
  const projectRoot = currentProject?.path;

  const onCreated = (project: Project) => {
    setProjects((p) => [...p, project]);
    setProject(project.slug);
    openFile(null);
  };

  return (
    <div className="arasul-leftpane">
      <ProjectPicker
        projects={projects}
        current={currentProject}
        driveRoot={driveRoot}
        handle={handle}
        onSelect={(slug) => { setProject(slug); openFile(null); }}
        onCreated={onCreated}
        onRefresh={refresh}
      />
      {currentProject && (
        <GitActions
          handle={handle}
          driveRoot={driveRoot}
          slug={currentProject.slug}
          refreshToken={refreshToken}
          onAfterAction={refresh}
        />
      )}
      <div className="arasul-leftpane-tree">
        <TreePane
          rootPath={projectRoot}
          emptyHint={projects.length === 0 ? "No projects yet. Click + to start one." : "Pick a project above."}
        />
      </div>
    </div>
  );
}

// ---------- ProjectPicker ----------

type PickerProps = {
  projects: Project[];
  current: Project | null;
  driveRoot: string;
  handle: string;
  onSelect: (slug: string) => void;
  onCreated: (p: Project) => void;
  onRefresh: () => void;
};

function ProjectPicker({ projects, current, driveRoot, handle, onSelect, onCreated, onRefresh: _onRefresh }: PickerProps) {
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<"new" | "import" | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="arasul-picker" ref={ref}>
      <button className="arasul-picker-trigger" onClick={() => setOpen((o) => !o)}>
        <Folder size={14} className="arasul-picker-icon" />
        <span className="arasul-picker-name">
          {current ? current.name : "No project"}
        </span>
        <ChevronDown size={14} className={"arasul-picker-chev" + (open ? " open" : "")} />
      </button>

      {open && (
        <div className="arasul-picker-menu" role="menu">
          {projects.length > 0 && (
            <div className="arasul-picker-section">
              {projects.map((p) => (
                <button
                  key={p.slug}
                  className={"arasul-picker-item" + (p.slug === current?.slug ? " active" : "")}
                  onClick={() => { onSelect(p.slug); setOpen(false); }}
                >
                  <Folder size={14} />
                  <span>{p.name}</span>
                  {p.git_repo && <span className="arasul-picker-badge">git</span>}
                </button>
              ))}
            </div>
          )}
          <div className="arasul-picker-section">
            <button className="arasul-picker-item" onClick={() => { setModal("new"); setOpen(false); }}>
              <Plus size={14} /> New project…
            </button>
            <button className="arasul-picker-item" onClick={() => { setModal("import"); setOpen(false); }}>
              <Download size={14} /> Import from GitHub…
            </button>
          </div>
        </div>
      )}

      {modal === "new" && (
        <NewProjectModal
          driveRoot={driveRoot}
          handle={handle}
          onClose={() => setModal(null)}
          onCreated={(p) => { onCreated(p); setModal(null); }}
        />
      )}
      {modal === "import" && (
        <ImportGithubModal
          driveRoot={driveRoot}
          onClose={() => setModal(null)}
          onImported={(p) => { onCreated(p); setModal(null); }}
        />
      )}
    </div>
  );
}

// ---------- GitActions: branch, ahead/behind, Pull/Push buttons ----------

function GitActions({ handle, driveRoot, slug, refreshToken, onAfterAction }: {
  handle: string;
  driveRoot: string;
  slug: string;
  refreshToken: number;
  onAfterAction: () => void;
}) {
  const [status, setStatus] = useState<GithubProjectStatus | null>(null);
  const [hasToken, setHasToken] = useState<boolean>(false);
  const [busy, setBusy] = useState<"pull" | "push" | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const reload = useCallback(async () => {
    try {
      const s = await invoke<GithubProjectStatus>("github_project_status", {
        args: { drive_root: driveRoot, slug },
      });
      setStatus(s);
    } catch {
      setStatus(null);
    }
    if (handle) {
      try {
        const t = await invoke<boolean>("github_has_token", { handle });
        setHasToken(t);
      } catch {
        setHasToken(false);
      }
    }
  }, [handle, driveRoot, slug]);

  useEffect(() => { void reload(); }, [reload, refreshToken]);

  const runPull = async () => {
    if (!handle) return;
    setBusy("pull"); setMsg(null);
    try {
      await invoke("github_pull", { args: { handle, drive_root: driveRoot, slug } });
      setMsg({ kind: "ok", text: "Pulled." });
      onAfterAction();
    } catch (e) {
      setMsg({ kind: "err", text: errorMessage(e) });
    } finally { setBusy(null); }
  };

  const runPush = async () => {
    if (!handle) return;
    setBusy("push"); setMsg(null);
    try {
      // No origin yet → offer to auto-create.
      if (status && status.is_repo && !status.has_origin) {
        await invoke("github_create_repo", {
          args: { handle, drive_root: driveRoot, slug, private: true, push: true },
        });
      } else {
        await invoke("github_push", { args: { handle, drive_root: driveRoot, slug } });
      }
      setMsg({ kind: "ok", text: "Pushed." });
      onAfterAction();
    } catch (e) {
      setMsg({ kind: "err", text: errorMessage(e) });
    } finally { setBusy(null); }
  };

  if (!hasToken) {
    return (
      <div className="arasul-git-row arasul-git-disconnected">
        <GitBranch size={12} />
        <span>GitHub not connected</span>
        <span className="arasul-git-spacer" />
      </div>
    );
  }

  return (
    <div className="arasul-git-row">
      <div className="arasul-git-meta">
        <GitBranch size={12} />
        <span className="arasul-git-branch">{status?.branch ?? (status?.is_repo ? "—" : "no repo")}</span>
        {status?.ahead ? <span className="arasul-git-counter" title="commits ahead of origin">↑{status.ahead}</span> : null}
        {status?.behind ? <span className="arasul-git-counter" title="commits behind origin">↓{status.behind}</span> : null}
        {status?.dirty ? <span className="arasul-git-counter dirty" title="modified files">●{status.dirty}</span> : null}
      </div>
      <button
        className="arasul-git-btn"
        onClick={runPull}
        disabled={busy !== null || !status?.is_repo || !status?.has_origin}
        title="git pull"
      >
        <ArrowDown size={12} /> Pull
      </button>
      <button
        className="arasul-git-btn primary"
        onClick={runPush}
        disabled={busy !== null}
        title={status?.has_origin ? "git add+commit+push" : "Create private repo + push"}
      >
        <ArrowUp size={12} /> {status?.is_repo && !status?.has_origin ? "Push (create repo)" : "Push"}
      </button>
      {msg && (
        <span className={"arasul-git-msg arasul-git-msg-" + msg.kind} title={msg.text}>
          {msg.kind === "ok" ? "✓" : "!"}
        </span>
      )}
    </div>
  );
}

// ---------- Modals ----------

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="arasul-modal-overlay" onClick={onClose}>
      <div className="arasul-modal" onClick={(e) => e.stopPropagation()}>
        <div className="arasul-modal-head">
          <h3>{title}</h3>
          <button onClick={onClose} className="arasul-modal-close"><X size={16} /></button>
        </div>
        <div className="arasul-modal-body">{children}</div>
      </div>
    </div>
  );
}

function NewProjectModal({ driveRoot, handle, onClose, onCreated }: {
  driveRoot: string;
  handle: string;
  onClose: () => void;
  onCreated: (p: Project) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [autoRepo, setAutoRepo] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!handle) { setHasToken(false); return; }
    void invoke<boolean>("github_has_token", { handle })
      .then(setHasToken)
      .catch(() => setHasToken(false));
  }, [handle]);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true); setError(null);
    try {
      const p = await invoke<Project>("create_project", {
        args: { name: name.trim(), description: description.trim() || null, drive_root: driveRoot },
      });
      // Auto-create private GitHub repo if token saved + checkbox set.
      if (hasToken && autoRepo) {
        try {
          await invoke("github_create_repo", {
            args: { handle, drive_root: driveRoot, slug: p.slug, private: true, push: true },
          });
        } catch (e) {
          // Project itself succeeded; surface the github failure but don't roll back.
          console.warn("auto-create-repo failed:", e);
          setError("Project created, but couldn't create the GitHub repo: " + errorMessage(e));
        }
      }
      onCreated(p);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal title="Create project" onClose={onClose}>
      <label>Project name
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. thesis"
          onKeyDown={(e) => { if (e.key === "Enter" && name.trim() && !busy) void submit(); }}
        />
      </label>
      <label>Description (optional)
        <textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What's this project about?"
        />
      </label>
      {hasToken && (
        <label className="arasul-checkbox-row">
          <input
            type="checkbox"
            checked={autoRepo}
            onChange={(e) => setAutoRepo(e.target.checked)}
          />
          <span>Create a private GitHub repo and push the initial commit</span>
        </label>
      )}
      {error && <div className="arasul-error">{error}</div>}
      <div className="arasul-modal-actions">
        <button type="button" className="arasul-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="arasul-btn primary" onClick={() => void submit()} disabled={busy || !name.trim()}>
          {busy ? "Creating…" : "Create project"}
        </button>
      </div>
    </Modal>
  );
}

function ImportGithubModal({ driveRoot, onClose, onImported }: {
  driveRoot: string;
  onClose: () => void;
  onImported: (p: Project) => void;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!url.trim()) return;
    setBusy(true); setError(null);
    try {
      const p = await invoke<Project>("project_import_github", {
        args: { url: url.trim(), drive_root: driveRoot },
      });
      onImported(p);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal title="Import from GitHub" onClose={onClose}>
      <label>Repository URL
        <input
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/owner/repo.git"
          onKeyDown={(e) => { if (e.key === "Enter" && url.trim() && !busy) void submit(); }}
        />
      </label>
      <p className="arasul-muted-sm">
        Uses your local <code>git</code> credentials. Public repos work out of the box;
        private ones need a credential helper or SSH key already configured on this Mac.
      </p>
      {error && <div className="arasul-error">{error}</div>}
      <div className="arasul-modal-actions">
        <button type="button" className="arasul-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="arasul-btn primary" onClick={() => void submit()} disabled={busy || !url.trim()}>
          {busy ? "Cloning…" : "Import"}
        </button>
      </div>
    </Modal>
  );
}

function errorMessage(e: unknown): string {
  if (typeof e === "object" && e && "message" in e) return String((e as { message: unknown }).message);
  if (typeof e === "object" && e && "kind" in e) return String((e as { kind: unknown }).kind);
  return String(e);
}
