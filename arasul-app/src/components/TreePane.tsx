import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronRight, ChevronDown, Folder, FolderOpen, Eye, EyeOff, Search, X,
         FilePlus2,
         Edit2, Trash2, FileText, FolderPlus, ExternalLink, Copy } from "lucide-react";
import { useWorkspace } from "../lib/workspace";
import { useSession } from "../lib/session";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "./ui";
import { iconForFile } from "../lib/fileIcons";
import { getRecent } from "../lib/recentFiles";
import { notify } from "../lib/toast";
import "./TreePane.css";

const SHOW_HIDDEN_KEY = "arasul.tree.showHidden";

type FilteredNode = {
  name: string;
  path: string;
  kind: "file" | "dir";
  size_bytes?: number;
  mtime?: string;
  is_hidden: boolean;
  children?: FilteredNode[];
};

/**
 * Phase 1.2 — tree pane backed by the Rust list_tree command.
 *
 * The tree fetches lazily on folder-click; root-level fetch on mount.
 * Handroll for now (no virtualisation); react-arborist introduced when
 * a project has >5000 files (Phase 2).
 */
type TreePaneProps = {
  /** Directory to list. If undefined, the tree shows an empty state. */
  rootPath?: string;
  /** Text shown in the empty state when `rootPath` is undefined. */
  emptyHint?: string;
};

export function TreePane({ rootPath, emptyHint }: TreePaneProps = {}) {
  const { state: sessionState } = useSession();
  const { state: ws, openFile } = useWorkspace();
  const [roots, setRoots] = useState<FilteredNode[]>([]);
  const [expanded, setExpanded] = useState<Record<string, FilteredNode[]>>({});
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ path: string; name: string } | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [focusIdx, setFocusIdx] = useState(0);
  const [showHidden, setShowHiddenState] = useState<boolean>(() => {
    try { return window.localStorage.getItem(SHOW_HIDDEN_KEY) === "1"; }
    catch { return false; }
  });
  const [filter, setFilter] = useState("");
  const filterInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refresh = () => setRefreshToken((n) => n + 1);

  const toggleShowHidden = () => {
    setShowHiddenState((cur) => {
      const next = !cur;
      try { window.localStorage.setItem(SHOW_HIDDEN_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };

  // Flatten the visible tree into an ordered list — the only source the
  // keyboard navigation reads. Recomputed on every render of relevant deps.
  const visible = useMemo<{ node: FilteredNode; depth: number }[]>(() => {
    const out: { node: FilteredNode; depth: number }[] = [];
    const walk = (nodes: FilteredNode[], depth: number) => {
      for (const n of nodes) {
        out.push({ node: n, depth });
        if (n.kind === "dir" && openFolders.has(n.path) && expanded[n.path]) {
          walk(expanded[n.path], depth + 1);
        }
      }
    };
    walk(roots, 0);

    // Filter — case-insensitive substring match on the node name. When
    // active, also include parent folders of any match so the result has
    // structural context. Skip when the query is empty for cheapness.
    const q = filter.trim().toLowerCase();
    if (!q) return out;
    const keep = new Set<number>();
    for (let i = 0; i < out.length; i++) {
      if (out[i].node.name.toLowerCase().includes(q)) {
        keep.add(i);
        // Walk back, marking all shallower-depth ancestors.
        let depth = out[i].depth;
        for (let j = i - 1; j >= 0 && depth > 0; j--) {
          if (out[j].depth < depth) {
            keep.add(j);
            depth = out[j].depth;
          }
        }
      }
    }
    return out.filter((_, i) => keep.has(i));
  }, [roots, expanded, openFolders, filter]);

  useEffect(() => {
    if (sessionState.status !== "unlocked") return;
    if (!rootPath) { setRoots([]); setExpanded({}); setOpenFolders(new Set()); setError(null); return; }
    (async () => {
      try {
        const nodes = await invoke<FilteredNode[]>("list_tree", {
          path: rootPath,
          options: { show_hidden: showHidden },
        });
        setRoots(nodes);
        const expandedPaths = Object.keys(expanded);
        for (const p of expandedPaths) {
          try {
            const children = await invoke<FilteredNode[]>("list_tree", {
              path: p, options: { show_hidden: showHidden },
            });
            setExpanded((s) => ({ ...s, [p]: children }));
          } catch { /* folder gone */ }
        }
        setError(null);
      } catch (e) {
        setError(String(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootPath, sessionState.status, refreshToken, showHidden]);

  const toggleFolder = async (node: FilteredNode) => {
    if (openFolders.has(node.path)) {
      setOpenFolders((s) => {
        const next = new Set(s);
        next.delete(node.path);
        return next;
      });
      return;
    }
    if (!expanded[node.path]) {
      try {
        const children = await invoke<FilteredNode[]>("list_tree", {
          path: node.path,
          options: { show_hidden: showHidden },
        });
        setExpanded((s) => ({ ...s, [node.path]: children }));
      } catch (e) {
        setError(String(e));
        return;
      }
    }
    setOpenFolders((s) => new Set(s).add(node.path));
  };

  const renderRow = (node: FilteredNode, depth: number, idx: number) => {
    const isOpen = openFolders.has(node.path);
    const isSelected = ws.openFilePath === node.path;
    const isFocused = focusIdx === idx;
    const iconColor = "var(--text-secondary)";
    const padLeft = 8 + depth * 16;
    const isRenaming = renaming?.path === node.path;
    const FileGlyph = node.kind === "file" ? iconForFile(node.name) : null;

    return (
      <ContextMenu key={node.path}>
        <ContextMenuTrigger asChild>
          <div
            role="treeitem"
            aria-level={depth + 1}
            aria-selected={isSelected}
            aria-expanded={node.kind === "dir" ? isOpen : undefined}
            className={"arasul-tree-row"
              + (isSelected ? " selected" : "")
              + (isFocused ? " focused" : "")
            }
            style={{ paddingLeft: padLeft }}
            data-idx={idx}
            onClick={() => {
              if (isRenaming) return;
              setFocusIdx(idx);
              node.kind === "dir" ? void toggleFolder(node) : openFile(node.path);
            }}
            onDoubleClick={(e) => {
              // Phase 0.7: Finder/Explorer-style rename. Folders ignore (single
              // click already toggles open/closed). Files enter rename mode.
              if (isRenaming || node.kind === "dir") return;
              e.stopPropagation();
              setRenaming({ path: node.path, name: node.name });
            }}
            // Phase 1.9: right-click is handled by ContextMenuTrigger. We
            // still want the focused-row indicator to follow the right-click.
            onContextMenu={() => setFocusIdx(idx)}
            title={node.path}
          >
            {node.kind === "dir" ? (
              isOpen ? (
                <ChevronDown size={12} className="arasul-tree-chev" />
              ) : (
                <ChevronRight size={12} className="arasul-tree-chev" />
              )
            ) : (
              <span className="arasul-tree-chev" />
            )}
            {node.kind === "dir" ? (
              isOpen ? <FolderOpen size={14} color={iconColor} /> : <Folder size={14} color={iconColor} />
            ) : FileGlyph ? (
              <FileGlyph size={14} color={iconColor} />
            ) : null}
            {isRenaming ? (
              <input
                className="arasul-tree-rename"
                value={renaming.name}
                autoFocus
                onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
                onClick={(e) => e.stopPropagation()}
                onFocus={(e) => {
                  // Phase 0.8: select the basename so the first keystroke
                  // replaces the whole name (skip the extension to make
                  // renaming `README.md` → `NOTES.md` a single action).
                  const v = e.currentTarget.value;
                  const dot = v.lastIndexOf(".");
                  if (dot > 0) e.currentTarget.setSelectionRange(0, dot);
                  else e.currentTarget.select();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void commitRename();
                  if (e.key === "Escape") setRenaming(null);
                }}
                onBlur={() => void commitRename()}
              />
            ) : (
              /* Phase 5.11: tooltip on the name span itself (the parent
                 row already has title={node.path}; this adds the bare
                 name for users who just want to see the truncated text
                 without the full path noise). */
              <span className="arasul-tree-name" title={node.name}>{node.name}</span>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {renderMenuItems(node)}
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  // Keyboard nav — only fires while the tree pane has focus, so the
  // editor's arrow keys aren't shadowed.
  const onTreeKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (renaming) return;  // rename input owns its own keydown
    if (visible.length === 0) return;
    const cur = visible[Math.min(focusIdx, visible.length - 1)];
    if (!cur) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusIdx((i) => Math.min(visible.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (cur.node.kind === "dir" && !openFolders.has(cur.node.path)) {
        void toggleFolder(cur.node);
      } else if (cur.node.kind === "dir" && openFolders.has(cur.node.path)) {
        setFocusIdx((i) => Math.min(visible.length - 1, i + 1));
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (cur.node.kind === "dir" && openFolders.has(cur.node.path)) {
        void toggleFolder(cur.node);
      }
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (cur.node.kind === "dir") void toggleFolder(cur.node);
      else openFile(cur.node.path);
    } else if (e.key === "Home") {
      e.preventDefault();
      setFocusIdx(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setFocusIdx(visible.length - 1);
    } else if (e.key === "F2") {
      // F2 is the OS-conventional rename shortcut (Windows + most Linux DEs).
      // macOS uses Return, but Return is already wired to open/expand —
      // keep both.
      e.preventDefault();
      setRenaming({ path: cur.node.path, name: cur.node.name });
    } else if ((e.key === "f" || e.key === "F") && (e.metaKey || e.ctrlKey)) {
      // ⌘F inside a focused tree → focus the filter input, like Finder.
      e.preventDefault();
      filterInputRef.current?.focus();
      filterInputRef.current?.select();
    }
  };

  const newFileAtRoot = async () => {
    if (!rootPath) return;
    const name = window.prompt("New file name", "untitled.md");
    if (!name) return;
    const p = `${rootPath}/${name}`;
    try {
      await invoke("write_file", { path: p, content: "" });
      refresh();
      openFile(p);
    } catch (e) {
      notify.err("Couldn't create file", e);
    }
  };

  const newFolderAtRoot = async () => {
    if (!rootPath) return;
    const name = window.prompt("Folder name", "untitled");
    if (!name) return;
    // Phase 5.3: real mkdir command — no more .gitkeep placeholder.
    try {
      await invoke("mkdir", { path: `${rootPath}/${name}` });
      refresh();
    } catch (e) {
      notify.err("Couldn't create folder", e);
    }
  };

  // Scroll the focused row into view when focus moves.
  useEffect(() => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-idx="${focusIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [focusIdx]);

  const commitRename = async () => {
    if (!renaming) return;
    const oldPath = renaming.path;
    const parent = oldPath.substring(0, oldPath.lastIndexOf("/"));
    const newPath = `${parent}/${renaming.name}`;
    setRenaming(null);
    if (newPath === oldPath) return;
    try {
      await invoke("rename", { src: oldPath, dst: newPath });
      refresh();
    } catch (e) {
      notify.err("Couldn't rename", e);
    }
  };

  /**
   * Phase 1.9 (2026-05-11): context-menu items rendered inline per row via
   * Radix ContextMenu primitives. Gives us free keyboard nav (arrow keys,
   * Enter, Esc, type-ahead) and submenu support — neither was in the old
   * custom ContextMenu. The trade-off is one Radix tree per row, but the
   * Portal-based Content only mounts on right-click so DOM cost is minimal.
   */
  const renderMenuItems = (node: FilteredNode) => (
    <>
      <ContextMenuItem onSelect={() => setRenaming({ path: node.path, name: node.name })}>
        <Edit2 /> Rename
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => {
        try {
          void navigator.clipboard.writeText(node.path);
          notify.ok("Path copied");
        } catch (e) {
          notify.err("Couldn't copy path", e);
        }
      }}>
        <Copy /> Copy path
      </ContextMenuItem>
      {/* Phase 5.10: relative-to-project copy. Useful for non-coders
          authoring markdown links — they get `notes/foo.md` instead of
          a 200-char absolute path. */}
      {rootPath && node.path.startsWith(rootPath) && (
        <ContextMenuItem onSelect={() => {
          const rel = node.path.slice(rootPath.length).replace(/^\/+/, "");
          try {
            void navigator.clipboard.writeText(rel);
            notify.ok("Relative path copied");
          } catch (e) {
            notify.err("Couldn't copy relative path", e);
          }
        }}>
          <Copy /> Copy relative path
        </ContextMenuItem>
      )}
      <ContextMenuItem onSelect={() =>
        void invoke("reveal_in_finder", { path: node.path })
          .catch((e) => notify.err("Couldn't reveal in Finder", e))
      }>
        <ExternalLink /> Reveal in Finder
      </ContextMenuItem>
      <ContextMenuSeparator />
      {node.kind === "dir" && (
        <>
          <ContextMenuItem onSelect={async () => {
            const name = window.prompt("New file name", "untitled.md");
            if (!name) return;
            const p = `${node.path}/${name}`;
            try {
              await invoke("write_file", { path: p, content: "" });
              refresh();
              openFile(p);
            } catch (e) {
              notify.err("Couldn't create file", e);
            }
          }}>
            <FileText /> New file here
          </ContextMenuItem>
          <ContextMenuItem onSelect={async () => {
            const name = window.prompt("Folder name", "untitled");
            if (!name) return;
            // Phase 5.3: real mkdir — no .gitkeep placeholder.
            try {
              await invoke("mkdir", { path: `${node.path}/${name}` });
              refresh();
            } catch (e) {
              notify.err("Couldn't create folder", e);
            }
          }}>
            <FolderPlus /> New folder here
          </ContextMenuItem>
          <ContextMenuSeparator />
        </>
      )}
      <ContextMenuItem destructive onSelect={async () => {
        if (!window.confirm(`Move "${node.name}" to Trash?`)) return;
        try {
          await invoke("delete", { path: node.path });
          refresh();
        } catch (e) {
          notify.err(`Couldn't delete "${node.name}"`, e);
        }
      }}>
        <Trash2 /> Delete
      </ContextMenuItem>
    </>
  );

  if (sessionState.status !== "unlocked") {
    return <div className="arasul-tree-empty">Drive locked</div>;
  }

  if (!rootPath) {
    return (
      <div className="arasul-tree-empty">
        <p>{emptyHint ?? "No project open."}</p>
      </div>
    );
  }

  if (error) return <div className="arasul-tree-empty">list_tree error: {error}</div>;

  return (
    <div
      className="arasul-tree"
      tabIndex={0}
      role="tree"
      aria-label="Project files"
      onKeyDown={onTreeKeyDown}
    >
      <div className="arasul-tree-toolbar">
        <div className="arasul-tree-filter">
          <Search size={11} className="arasul-tree-filter-icon" />
          <input
            ref={filterInputRef}
            type="text"
            placeholder="Filter files…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") { setFilter(""); (e.target as HTMLInputElement).blur(); }
              if (e.key === "ArrowDown") { e.preventDefault(); setFocusIdx(0); (e.target as HTMLInputElement).blur(); }
            }}
            aria-label="Filter files in tree"
          />
          {filter && (
            <button
              type="button"
              className="arasul-tree-filter-clear"
              onClick={() => setFilter("")}
              title="Clear filter (Esc)"
              aria-label="Clear filter"
            >
              <X size={11} />
            </button>
          )}
        </div>
        <button
          type="button"
          className="arasul-tree-tbtn"
          onClick={() => void newFileAtRoot()}
          title="New file in project root"
          aria-label="New file"
        >
          <FilePlus2 size={13} />
        </button>
        <button
          type="button"
          className="arasul-tree-tbtn"
          onClick={() => void newFolderAtRoot()}
          title="New folder in project root"
          aria-label="New folder"
        >
          <FolderPlus size={13} />
        </button>
        <button
          type="button"
          className={"arasul-tree-tbtn" + (showHidden ? " active" : "")}
          onClick={toggleShowHidden}
          title={showHidden ? "Hide hidden files (.git, .env, …)" : "Show hidden files (.git, .env, .github, …)"}
          aria-label={showHidden ? "Hide hidden files" : "Show hidden files"}
          aria-pressed={showHidden}
        >
          {showHidden ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
      </div>
      {rootPath && <RecentGroup rootPath={rootPath} onOpen={openFile} />}
      <div className="arasul-tree-scroll" ref={scrollRef}>
        {roots.length === 0 ? (
          <div className="arasul-tree-empty">
            <p>This project is empty.</p>
            <p className="arasul-tree-empty-hint">
              Right-click in the tree → <strong>New file here</strong>, or drop files into the folder.
            </p>
          </div>
        ) : (
          visible.map(({ node, depth }, idx) => renderRow(node, depth, idx))
        )}
      </div>
    </div>
  );
}

/**
 * Phase 5.7 (2026-05-11): collapsible "Recent" group at the top of the
 * tree. Pulls from the same MRU list the command palette uses
 * (recentFiles.ts), filtered to files inside the current project root.
 *
 * Uses native `<details>` so the open/closed state is a11y-correct
 * out of the box (screen readers announce the disclosure). Persisted
 * via localStorage so the user's preference survives reloads.
 */
function RecentGroup({
  rootPath,
  onOpen,
}: {
  rootPath: string;
  onOpen: (path: string) => void;
}) {
  const { state: ws } = useWorkspace();
  const [recent, setRecent] = useState<string[]>(() => getRecent());

  // Refresh on workspace events that imply the MRU changed.
  useEffect(() => {
    setRecent(getRecent());
  }, [ws.openFilePath]);

  const filtered = useMemo(
    () => recent.filter((p) => p.startsWith(rootPath + "/")).slice(0, 5),
    [recent, rootPath],
  );

  if (filtered.length === 0) return null;

  return (
    <details
      className="arasul-tree-recent"
      open={localStorage.getItem("arasul.tree.recentOpen") !== "0"}
      onToggle={(e) => {
        const open = (e.currentTarget as HTMLDetailsElement).open;
        try {
          localStorage.setItem("arasul.tree.recentOpen", open ? "1" : "0");
        } catch { /* ignore */ }
      }}
    >
      <summary className="arasul-tree-recent-summary">
        <ChevronRight size={11} className="arasul-tree-recent-chev" />
        <span>Recent</span>
        <span className="arasul-tree-recent-count">{filtered.length}</span>
      </summary>
      <div className="arasul-tree-recent-list">
        {filtered.map((path) => {
          const name = path.split("/").pop() ?? path;
          return (
            <button
              key={path}
              type="button"
              className={"arasul-tree-recent-item" + (ws.openFilePath === path ? " active" : "")}
              onClick={() => onOpen(path)}
              title={path.slice(rootPath.length + 1)}
            >
              <FileText size={12} aria-hidden="true" />
              <span>{name}</span>
            </button>
          );
        })}
      </div>
    </details>
  );
}
