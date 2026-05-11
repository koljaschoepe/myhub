import { useState } from "react";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";
import { FolderTree, FileText, Terminal as TerminalIcon } from "lucide-react";
import { LeftPane } from "./LeftPane";
import { EditorPane } from "./EditorPane";
import { RightPane } from "./RightPane";
import { useTier } from "../lib/viewport";
import "./ThreePaneShell.css";

/**
 * Design-spec §2.3 responsive tiers.
 *   FULL     ≥ 1280
 *   MEDIUM   900-1279
 *   COMPACT  < 900
 *
 * react-resizable-panels v4 interprets bare numbers on `defaultSize` /
 * `minSize` / `maxSize` as **pixels**, not percentages. Pass strings with
 * an explicit `%` suffix for percentage sizing.
 */
export function ThreePaneShell() {
  const tier = useTier();
  if (tier === "compact") return <CompactShell />;
  if (tier === "medium")  return <MediumShell />;
  return <FullShell />;
}

function FullShell() {
  // Phase 3.7: persist pane widths across reloads via the library's
  // useDefaultLayout hook (defaults to localStorage). Keyed by the
  // group id, so the medium/compact variants don't collide.
  // Phase 3.8: double-click a Separator → react-resizable-panels resets
  // to the saved defaultLayout (library built-in; no extra wiring needed).
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "arasul.shell.full.v2",
  });
  return (
    <Group
      orientation="horizontal"
      className="arasul-shell"
      id="arasul.shell.full.v2"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
    >
      <Panel defaultSize="20%" minSize="14%" maxSize="32%" className="arasul-pane arasul-pane-tree">
        <LeftPane />
      </Panel>
      <Separator className="arasul-resize" />
      <Panel defaultSize="50%" minSize="30%" className="arasul-pane arasul-pane-editor">
        <EditorPane />
      </Panel>
      <Separator className="arasul-resize" />
      <Panel defaultSize="30%" minSize="22%" maxSize="45%" className="arasul-pane arasul-pane-right">
        <RightPane />
      </Panel>
    </Group>
  );
}

function MediumShell() {
  const [treeOpen, setTreeOpen] = useState(false);
  return (
    <div className="arasul-shell arasul-shell-medium">
      <button
        className={"arasul-tree-rail" + (treeOpen ? " open" : "")}
        title="Files"
        onClick={() => setTreeOpen((o) => !o)}
        aria-label="Toggle file tree"
      >
        <FolderTree size={18} />
      </button>
      {treeOpen && (
        <div className="arasul-tree-overlay" onClick={(e) => {
          if (e.target === e.currentTarget) setTreeOpen(false);
        }}>
          <div className="arasul-tree-overlay-body arasul-pane">
            <LeftPane />
          </div>
        </div>
      )}
      <MediumGroup />
    </div>
  );
}

function MediumGroup() {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "arasul.shell.medium.v2",
  });
  return (
    <Group
      orientation="horizontal"
      className="arasul-shell-inner"
      id="arasul.shell.medium.v2"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
    >
      <Panel defaultSize="60%" minSize="35%" className="arasul-pane arasul-pane-editor">
        <EditorPane />
      </Panel>
      <Separator className="arasul-resize" />
      <Panel defaultSize="40%" minSize="25%" maxSize="55%" className="arasul-pane arasul-pane-right">
        <RightPane />
      </Panel>
    </Group>
  );
}

type CompactTab = "tree" | "editor" | "hub";

function CompactShell() {
  const [tab, setTab] = useState<CompactTab>("editor");
  return (
    <div className="arasul-shell arasul-shell-compact">
      <div className="arasul-shell-compact-body">
        <div className={"arasul-compact-panel" + (tab === "tree" ? "" : " hidden")}><LeftPane /></div>
        <div className={"arasul-compact-panel" + (tab === "editor" ? "" : " hidden")}><EditorPane /></div>
        <div className={"arasul-compact-panel" + (tab === "hub" ? "" : " hidden")}><RightPane /></div>
      </div>
      <nav className="arasul-compact-tabs">
        {([
          { id: "tree", icon: FolderTree, label: "Project" },
          { id: "editor", icon: FileText, label: "Editor" },
          { id: "hub", icon: TerminalIcon, label: "OpenAra" },
        ] as const).map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            className={"arasul-compact-tab" + (tab === id ? " active" : "")}
            onClick={() => setTab(id)}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
