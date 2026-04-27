import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronRight, ChevronDown, Folder, FolderOpen, Eye, EyeOff, Search, X,
         FilePlus2,
         Edit2, Trash2, FileText, FolderPlus, ExternalLink, Copy } from "lucide-react";
import { useWorkspace } from "../lib/workspace";
import { useSession } from "../lib/session";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { iconForFile } from "../lib/fileIcons";
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
  const [menu, setMenu] = useState<{ x: number; y: number; node: FilteredNode } | null>(null);
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
      <div
        key={node.path}
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
        onContextMenu={(e) => {
          e.preventDefault();
          setFocusIdx(idx);
          setMenu({ x: e.clientX, y: e.clientY, node });
        }}
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
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitRename();
              if (e.key === "Escape") setRenaming(null);
            }}
            onBlur={() => void commitRename()}
          />
        ) : (
          <span className="arasul-tree-name">{node.name}</span>
        )}
      </div>
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
    const placeholder = `${rootPath}/${name}/.gitkeep`;
    try {
      await invoke("write_file", { path: placeholder, content: "" });
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

  const menuItems = (node: FilteredNode): MenuItem[] => [
    { type: "item", label: "Rename", icon: <Edit2 size={14} />,
      onClick: () => setRenaming({ path: node.path, name: node.name }) },
    { type: "item", label: "Copy path", icon: <Copy size={14} />,
      onClick: () => {
        try {
          void navigator.clipboard.writeText(node.path);
          notify.ok("Path copied");
        } catch (e) {
          notify.err("Couldn't copy path", e);
        }
      } },
    { type: "item", label: "Reveal in Finder", icon: <ExternalLink size={14} />,
      onClick: () => void invoke("reveal_in_finder", { path: node.path })
        .catch((e) => notify.err("Couldn't reveal in Finder", e)) },
    { type: "separator" },
    ...(node.kind === "dir" ? [
      {
        type: "item" as const, label: "New file here", icon: <FileText size={14} />,
        onClick: async () => {
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
        },
      },
      {
        type: "item" as const, label: "New folder here", icon: <FolderPlus size={14} />,
        onClick: async () => {
          const name = window.prompt("Folder name", "untitled");
          if (!name) return;
          // No dedicated mkdir command — write a .gitkeep placeholder so the
          // empty dir survives. The user can delete the placeholder once they
          // add real files.
          const placeholder = `${node.path}/${name}/.gitkeep`;
          try {
            await invoke("write_file", { path: placeholder, content: "" });
            refresh();
          } catch (e) {
            notify.err("Couldn't create folder", e);
          }
        },
      },
      { type: "separator" as const },
    ] : []),
    {
      type: "item", label: "Delete", destructive: true, icon: <Trash2 size={14} />,
      onClick: async () => {
        if (!window.confirm(`Move "${node.name}" to Trash?`)) return;
        try {
          await invoke("delete", { path: node.path });
          refresh();
        } catch (e) {
          notify.err(`Couldn't delete "${node.name}"`, e);
        }
      },
    },
  ];

  if (sessionState.status !== "unlocked") {
    return <div className="arasul-tree-empty">Vault locked</div>;
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
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menu.node)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
