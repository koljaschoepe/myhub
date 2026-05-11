import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { GitBranch, ArrowUp, ArrowDown, Pencil, Lock, HelpCircle } from "lucide-react";
import { useSession } from "../lib/session";
import { useWorkspace } from "../lib/workspace";
import { notify } from "../lib/toast";
import "./StatusBar.css";

type Hint = { keys: string; label: string; trigger: () => void };

/** Dispatch a synthetic keydown so App.tsx's global handler runs. Lets
    StatusBar be a click→shortcut surface without prop-drilling. */
const fire = (key: string, opts: { meta?: boolean; shift?: boolean } = {}) => {
  const evt = new KeyboardEvent("keydown", {
    key,
    metaKey: opts.meta ?? true,
    ctrlKey: opts.meta ?? true,
    shiftKey: opts.shift ?? false,
    bubbles: true,
  });
  window.dispatchEvent(evt);
};

type GitStatus = {
  is_repo: boolean;
  has_origin: boolean;
  branch: string | null;
  ahead: number;
  behind: number;
  dirty: number;
};

function languageOf(path: string | null): string | null {
  if (!path) return null;
  const ext = path.toLowerCase().split(".").pop();
  if (!ext) return null;
  const map: Record<string, string> = {
    md: "Markdown", mdx: "Markdown", markdown: "Markdown",
    ts: "TypeScript", tsx: "TypeScript",
    js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
    py: "Python", rs: "Rust", go: "Go", rb: "Ruby", java: "Java",
    c: "C", cpp: "C++", h: "C", hpp: "C++", swift: "Swift", kt: "Kotlin",
    json: "JSON", yaml: "YAML", yml: "YAML", toml: "TOML", xml: "XML",
    html: "HTML", htm: "HTML", css: "CSS", scss: "SCSS", sql: "SQL",
    pdf: "PDF", png: "Image", jpg: "Image", jpeg: "Image",
    csv: "CSV", tsv: "TSV", docx: "Word",
  };
  return map[ext] ?? ext.toUpperCase();
}

export function StatusBar() {
  const { state, driveRoot, lock } = useSession();
  const { state: ws } = useWorkspace();
  const [git, setGit] = useState<GitStatus | null>(null);
  const vault =
    state.status === "unlocked" ? "unlocked" : state.status === "locked" ? "locked" : "absent";
  const project = ws.projectSlug ?? "no project";
  const lang = languageOf(ws.openFilePath);

  const hints: Hint[] = [
    { keys: "⌘P",  label: "files",    trigger: () => fire("p", { meta: true }) },
    { keys: "⌘⇧P", label: "projects", trigger: () => fire("p", { meta: true, shift: true }) },
    { keys: "⌘K",  label: "command",  trigger: () => fire("k", { meta: true }) },
    { keys: "⌘⇧F", label: "search",   trigger: () => fire("f", { meta: true, shift: true }) },
  ];

  // Refresh git status every 8s + on project switch.
  useEffect(() => {
    if (!ws.projectSlug || state.status !== "unlocked") { setGit(null); return; }
    let cancelled = false;
    const fetch = async () => {
      try {
        const s = await invoke<GitStatus>("github_project_status", {
          args: { drive_root: driveRoot, slug: ws.projectSlug },
        });
        if (!cancelled) setGit(s);
      } catch { /* keep last value */ }
    };
    void fetch();
    const id = window.setInterval(fetch, 8000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [ws.projectSlug, driveRoot, state.status]);

  const onLockClick = () => {
    if (state.status !== "unlocked") return;
    void lock().catch((e) => notify.err("Couldn't lock the drive", e));
  };

  return (
    <footer className="arasul-statusbar">
      {hints.map((h) => (
        <button
          key={h.keys}
          type="button"
          className="arasul-keyhint"
          onClick={h.trigger}
          title={`${h.keys} — ${h.label}`}
        >
          <kbd>{h.keys}</kbd> {h.label}
        </button>
      ))}
      <span className="arasul-status-right">
        {git?.is_repo && (
          <>
            <span className="arasul-status-git" title={`Branch · ${git.ahead} ahead · ${git.behind} behind · ${git.dirty} changes`}>
              <GitBranch size={10} />
              <span>{git.branch ?? "—"}</span>
              {git.ahead > 0 && (
                <span title={`${git.ahead} commit${git.ahead === 1 ? "" : "s"} ahead of GitHub`} aria-label={`${git.ahead} ahead of GitHub`}>
                  <ArrowUp size={10} aria-hidden="true" />{git.ahead}
                </span>
              )}
              {git.behind > 0 && (
                <span title={`${git.behind} commit${git.behind === 1 ? "" : "s"} behind GitHub`} aria-label={`${git.behind} behind GitHub`}>
                  <ArrowDown size={10} aria-hidden="true" />{git.behind}
                </span>
              )}
              {git.dirty > 0 && (
                <span title={`${git.dirty} file${git.dirty === 1 ? "" : "s"} changed locally`} aria-label={`${git.dirty} files changed`}>
                  <Pencil size={10} aria-hidden="true" />{git.dirty}
                </span>
              )}
            </span>
            <span className="arasul-status-sep">·</span>
          </>
        )}
        {lang && <><span>{lang}</span><span className="arasul-status-sep">·</span></>}
        <button
          type="button"
          className="arasul-status-clickable"
          onClick={onLockClick}
          title={vault === "unlocked" ? "Click to lock the drive (⌘L)" : "Drive is locked"}
          disabled={vault !== "unlocked"}
        >
          <Lock size={10} /> drive {vault}
        </button>
        <span className="arasul-status-sep">·</span>
        <span>{project}</span>
        <span className="arasul-status-sep">·</span>
        {/* Phase 3.10: persistent help button. Stays visible at every
            breakpoint, including <900px where the hint row above hides.
            Single source of truth for "where are the shortcuts?". */}
        <button
          type="button"
          className="arasul-status-clickable"
          onClick={() => fire("/", { meta: true })}
          title="Keyboard shortcuts (⌘/)"
          aria-label="Show keyboard shortcuts"
        >
          <HelpCircle size={12} aria-hidden="true" />
        </button>
      </span>
    </footer>
  );
}
