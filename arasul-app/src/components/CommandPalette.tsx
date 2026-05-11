import { useMemo, useState, useEffect } from "react";
import { Command, useCommandState } from "cmdk";
import { invoke } from "@tauri-apps/api/core";
import { useWorkspace } from "../lib/workspace";
import { useSession } from "../lib/session";
import { getRecent } from "../lib/recentFiles";
import { getRecentCommands, pushRecentCommand } from "../lib/recentCommands";
import { Dialog, DialogContent } from "./ui";
import "./CommandPalette.css";

/**
 * Phase 7.3 (2026-05-11): stable command registry. Each entry has an
 * `id` (used for the recents MRU), a label, an optional kbd hint, and
 * a `run()` closure. The "Recent" group at the top of the palette
 * pulls IDs from getRecentCommands() and renders matching entries first.
 */
type Cmd = {
  id: string;
  group: string;
  label: string;
  kbd?: string;
  run: () => void | Promise<void>;
};

type Project = {
  slug: string;
  name: string;
  path: string;
};

/**
 * Multi-mode palette: commands (⌘K), file finder (⌘P), project switcher (⌘⇧P).
 * Modes share the cmdk surface — selecting a command can switch to another mode.
 *
 * Phase 1.8 (2026-05-11): migrated to Dialog primitive. Dropped the custom
 * `arasul-cmdk-overlay` + `arasul-cmdk-box` div wrapper and `useFocusTrap`;
 * Radix Dialog handles modal semantics, focus trap, Escape, and click-outside
 * (we still call onOpenChange(false) for the latter so cmdk state resets).
 * cmdk internals stay untouched — Command/Command.Input/Command.List etc.
 */
type Mode = "commands" | "projects" | "files";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSettings?: () => void;
  onOpenSearch?: () => void;
};

/**
 * Phase 2.5: announces the current filtered result count via an
 * aria-live region. cmdk filters incrementally as the user types, so
 * the screen reader hears "5 results for foo" etc. Suppressed when
 * the input is empty (no useful announcement) and debounced 200ms via
 * cmdk's own internal batching so we don't spam.
 */
function CmdkResultAnnouncer({ query }: { query: string }) {
  const count = useCommandState((state) => state.filtered.count);
  if (!query.trim()) return null;
  const text = count === 0
    ? "No matches"
    : count === 1 ? "1 result" : `${count} results`;
  return (
    <span
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {text}
    </span>
  );
}

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

  useEffect(() => { if (!open) { setMode("commands"); setQuery(""); } }, [open]);

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

  const placeholders: Record<Mode, string> = {
    commands: "Type a command or search…",
    projects: "Find project…",
    files: ws.projectSlug ? "Find file in project…" : "No project open — pick one first",
  };

  // Phase 7.3: stable command registry. Memoized over the closures it
  // depends on so the array identity is stable across renders.
  const commands = useMemo<Cmd[]>(() => [
    { id: "find-file",       group: "Workspace", label: "Find file…",        kbd: "⌘P",
      run: () => setMode("files") },
    { id: "switch-project",  group: "Workspace", label: "Switch project…",   kbd: "⌘⇧P",
      run: () => setMode("projects") },
    { id: "search-files",    group: "Workspace", label: "Search across files…", kbd: "⌘⇧F",
      run: () => { onOpenSearch?.(); setOpen(false); } },
    { id: "lock-drive",      group: "Drive lock", label: "Lock drive",       kbd: "⌘⇧L",
      run: () => { void lock(); setOpen(false); } },
    { id: "open-settings",   group: "App", label: "Settings…",               kbd: "⌘,",
      run: () => { onOpenSettings?.(); setOpen(false); } },
    { id: "refresh-wiki",    group: "System", label: "Refresh wiki",
      run: async () => {
        try { await invoke("compile"); } catch (e) { console.warn(e); }
        setOpen(false);
      } },
    { id: "check-drive",     group: "System", label: "Check drive",
      run: async () => {
        try { await invoke("verify"); } catch (e) { console.warn(e); }
        setOpen(false);
      } },
    { id: "check-update",    group: "System", label: "Check for update",
      run: async () => {
        try { await invoke("check_for_update"); } catch (e) { console.warn(e); }
        setOpen(false);
      } },
  ], [setMode, onOpenSearch, setOpen, lock, onOpenSettings]);

  // Phase 7.3: which commands have been used recently. Capture a snapshot
  // when the palette opens — we don't want order to thrash mid-session
  // (Linear convention: stable list within an opening).
  const [recentIds, setRecentIds] = useState<string[]>([]);
  useEffect(() => {
    if (open) setRecentIds(getRecentCommands());
  }, [open]);

  const wrapRun = (c: Cmd) => () => {
    pushRecentCommand(c.id);
    return c.run();
  };

  const cmdById = useMemo(() => {
    const m = new Map<string, Cmd>();
    for (const c of commands) m.set(c.id, c);
    return m;
  }, [commands]);
  const recentCmds = recentIds
    .map((id) => cmdById.get(id))
    .filter((c): c is Cmd => !!c);
  const groups: Record<string, Cmd[]> = {};
  for (const c of commands) (groups[c.group] ??= []).push(c);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        size="lg"
        hideCloseButton
        titleSlot={null}
        aria-label="Command palette"
        // Override default Dialog spacing — the palette has its own tight
        // padding and the cmdk header doesn't want extra gap. Also pin to
        // top quarter of viewport, palette convention (VS Code / Linear).
        className="!p-0 !gap-0 !rounded-xl !top-[20vh] !translate-y-0 max-md:!top-[8vh]"
      >
        <Command label={placeholders[mode]} className="arasul-cmdk-inner">
          <Command.Input
            autoFocus
            placeholder={placeholders[mode]}
            className="arasul-cmdk-input"
            value={query}
            onValueChange={setQuery}
          />
          {/* Phase 2.5 (WCAG 4.1.3 Status Messages): announce filtered
              result count to screen readers without moving focus.
              Mounted as a child of Command so useCommandState picks up
              filtered.count from the cmdk context. */}
          <CmdkResultAnnouncer query={query} />
          <Command.List className="arasul-cmdk-list">
            <Command.Empty>No matches — try a different search.</Command.Empty>

            {mode === "commands" && (
              <>
                {/* Phase 7.3: Recent-commands group at top. Only renders
                    when the user has used 1+ commands and not currently
                    searching (filter > 0 chars hides recents — the cmdk
                    fuzzy match already surfaces matching commands across
                    every group). */}
                {recentCmds.length > 0 && !query && (
                  <Command.Group heading="Recent">
                    {recentCmds.map((c) => (
                      <Command.Item
                        key={`recent-${c.id}`}
                        value={`recent ${c.label}`}
                        onSelect={wrapRun(c)}
                      >
                        {c.label}
                        {c.kbd && <kbd>{c.kbd}</kbd>}
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
                {Object.entries(groups).map(([group, cs]) => (
                  <Command.Group key={group} heading={group}>
                    {cs.map((c) => (
                      <Command.Item
                        key={c.id}
                        value={c.label}
                        onSelect={wrapRun(c)}
                      >
                        {c.label}
                        {c.kbd && <kbd>{c.kbd}</kbd>}
                      </Command.Item>
                    ))}
                  </Command.Group>
                ))}
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
      </DialogContent>
    </Dialog>
  );
}
