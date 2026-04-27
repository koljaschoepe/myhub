import { useState, useEffect, useRef } from "react";
import { Command } from "cmdk";
import { invoke } from "@tauri-apps/api/core";
import { useWorkspace } from "../lib/workspace";
import { useSession } from "../lib/session";
import { useFocusTrap } from "../lib/useFocusTrap";
import { getRecent } from "../lib/recentFiles";
import "./CommandPalette.css";

type Project = {
  slug: string;
  name: string;
  path: string;
};

/**
 * Multi-mode palette: commands (⌘K), file finder (⌘P), project switcher (⌘⇧P).
 * Modes share the cmdk surface — selecting a command can switch to another mode.
 */
type Mode = "commands" | "projects" | "files";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSettings?: () => void;
  onOpenSearch?: () => void;
};

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const q = query.toLowerCase();
  const out: React.ReactNode[] = [];
  let qi = 0;
  let buf = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (qi < q.length && ch.toLowerCase() === q[qi]) {
      if (buf) { out.push(buf); buf = ""; }
      out.push(<mark key={i}>{ch}</mark>);
      qi++;
    } else {
      buf += ch;
    }
  }
  if (buf) out.push(buf);
  return out;
}

export function CommandPalette({ open, onOpenChange, onOpenSettings, onOpenSearch }: Props) {
  const [mode, setMode] = useState<Mode>("commands");
  const [projects, setProjects] = useState<Project[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const { setProject, openFile, state: ws } = useWorkspace();
  const { lock, driveRoot } = useSession();

  // Global shortcuts that open this palette in a specific mode.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "p" && e.shiftKey) {
        e.preventDefault();
        setMode("projects");
        onOpenChange(true);
      } else if (k === "p" && !e.shiftKey) {
        e.preventDefault();
        setMode("files");
        onOpenChange(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpenChange]);

  useEffect(() => { if (!open) setMode("commands"); }, [open]);

  const setOpen = onOpenChange;

  useEffect(() => {
    if (mode !== "projects" || !open) return;
    void invoke<Project[]>("list_projects", { driveRoot })
      .then(setProjects)
      .catch((e) => console.warn("list_projects failed:", e));
  }, [mode, open, driveRoot]);

  useEffect(() => {
    if (mode !== "files" || !open) return;
    setRecent(getRecent());
    if (!ws.projectSlug) { setFiles([]); return; }
    const root = `${driveRoot}/content/projects/${ws.projectSlug}`;
    void invoke<string[]>("list_project_files", { root })
      .then(setFiles)
      .catch((e) => { console.warn("list_project_files failed:", e); setFiles([]); });
  }, [mode, open, driveRoot, ws.projectSlug]);

  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  if (!open) return null;

  const placeholders: Record<Mode, string> = {
    commands: "Type a command or search…",
    projects: "Find project…",
    files: ws.projectSlug ? "Find file in project…" : "No project open — pick one first",
  };

  return (
    <div className="arasul-cmdk-overlay" onClick={() => setOpen(false)}>
      <div
        ref={dialogRef}
        className="arasul-cmdk-box"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <Command label={placeholders[mode]}>
          <Command.Input
            autoFocus
            placeholder={placeholders[mode]}
            className="arasul-cmdk-input"
            value={query}
            onValueChange={setQuery}
          />
          <Command.List className="arasul-cmdk-list">
            <Command.Empty>No results.</Command.Empty>

            {mode === "commands" && (
              <>
                <Command.Group heading="Workspace">
                  <Command.Item onSelect={() => setMode("files")}>
                    Find file… <kbd>⌘P</kbd>
                  </Command.Item>
                  <Command.Item onSelect={() => setMode("projects")}>
                    Switch project… <kbd>⌘⇧P</kbd>
                  </Command.Item>
                  <Command.Item onSelect={() => { onOpenSearch?.(); setOpen(false); }}>
                    Search across files… <kbd>⌘⇧F</kbd>
                  </Command.Item>
                </Command.Group>
                <Command.Group heading="Vault">
                  <Command.Item onSelect={() => { void lock(); setOpen(false); }}>
                    Lock vault
                  </Command.Item>
                </Command.Group>
                <Command.Group heading="App">
                  <Command.Item onSelect={() => { onOpenSettings?.(); setOpen(false); }}>
                    Settings… <kbd>⌘,</kbd>
                  </Command.Item>
                </Command.Group>
                <Command.Group heading="System">
                  <Command.Item onSelect={async () => {
                    try { await invoke("compile"); } catch (e) { console.warn(e); }
                    setOpen(false);
                  }}>Compile wiki</Command.Item>
                  <Command.Item onSelect={async () => {
                    try { await invoke("verify"); } catch (e) { console.warn(e); }
                    setOpen(false);
                  }}>Verify drive</Command.Item>
                  <Command.Item onSelect={async () => {
                    try { await invoke("check_for_update"); } catch (e) { console.warn(e); }
                    setOpen(false);
                  }}>Check for update</Command.Item>
                </Command.Group>
              </>
            )}

            {mode === "projects" && (
              <Command.Group heading="Projects">
                {projects.map((p) => (
                  <Command.Item
                    key={p.slug}
                    value={`${p.name} ${p.slug} ${p.path}`}
                    onSelect={() => { setProject(p.slug); setOpen(false); setMode("commands"); }}
                  >
                    {p.name} <span className="arasul-cmdk-sub">{p.slug}</span>
                  </Command.Item>
                ))}
                <Command.Item onSelect={() => { setProject(null); setOpen(false); setMode("commands"); }}>
                  (no project)
                </Command.Item>
              </Command.Group>
            )}

            {mode === "files" && !query && recent.length > 0 && (
              <Command.Group heading="Recent">
                {recent.map((path) => {
                  const parts = path.split("/");
                  const name = parts[parts.length - 1] ?? path;
                  const dir = parts.slice(0, -1).join("/").split("projects/")[1] ?? "";
                  return (
                    <Command.Item
                      key={"recent-" + path}
                      value={"recent " + path}
                      onSelect={() => { openFile(path); setOpen(false); setMode("commands"); }}
                    >
                      {name} <span className="arasul-cmdk-sub">{dir}</span>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}
            {mode === "files" && (
              <Command.Group heading={ws.projectSlug ? `Files · ${ws.projectSlug}` : "Files"}>
                {files.length === 0 && (
                  <Command.Item disabled>
                    {ws.projectSlug ? "Loading…" : "No project open."}
                  </Command.Item>
                )}
                {files.slice(0, 200).map((path) => {
                  const parts = path.split("/");
                  const name = parts[parts.length - 1] ?? path;
                  const dir = parts.slice(0, -1).join("/").split("projects/")[1] ?? "";
                  return (
                    <Command.Item
                      key={path}
                      value={path}
                      onSelect={() => { openFile(path); setOpen(false); setMode("commands"); }}
                    >
                      {highlight(name, query)} <span className="arasul-cmdk-sub">{dir}</span>
                    </Command.Item>
                  );
                })}
                {files.length > 200 && (
                  <Command.Item disabled className="arasul-cmdk-more">
                    + {files.length - 200} more — refine your search to narrow the list
                  </Command.Item>
                )}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
