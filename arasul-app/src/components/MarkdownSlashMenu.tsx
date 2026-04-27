import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Editor } from "@tiptap/react";
import {
  Heading1, Heading2, Heading3, Heading4, Heading5, Heading6,
  List, ListOrdered, ListTodo, Quote, Code2, Table as TableIcon,
  Image as ImageIcon, Minus, Sparkles, Wand2, Languages, Table2,
} from "lucide-react";
import { notify } from "../lib/toast";

type SyncRun = { kind: "sync"; run: (editor: Editor) => void };
type AiRun = { kind: "ai"; system: string };
type Item = {
  id: string;
  label: string;
  hint: string;
  keywords: string[];
  icon: React.ReactNode;
} & (SyncRun | AiRun);

const ITEMS: Item[] = [
  ...([1, 2, 3, 4, 5, 6] as const).map<Item>((lvl) => ({
    id: `h${lvl}`,
    label: `Heading ${lvl}`,
    hint: `H${lvl}`,
    keywords: ["heading", "title", `h${lvl}`],
    icon: [<Heading1 size={16} />, <Heading2 size={16} />, <Heading3 size={16} />,
           <Heading4 size={16} />, <Heading5 size={16} />, <Heading6 size={16} />][lvl - 1],
    kind: "sync",
    run: (editor: Editor) =>
      editor.chain().focus().toggleHeading({ level: lvl }).run(),
  })),
  {
    id: "bullet",
    label: "Bullet list",
    hint: "—",
    keywords: ["bullet", "ul", "list", "unordered"],
    icon: <List size={16} />,
    kind: "sync",
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    id: "ordered",
    label: "Numbered list",
    hint: "1.",
    keywords: ["ordered", "ol", "numbered", "list"],
    icon: <ListOrdered size={16} />,
    kind: "sync",
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    id: "task",
    label: "Task list",
    hint: "☐",
    keywords: ["task", "todo", "checkbox", "check"],
    icon: <ListTodo size={16} />,
    kind: "sync",
    run: (editor) => editor.chain().focus().toggleTaskList().run(),
  },
  {
    id: "quote",
    label: "Quote",
    hint: ">",
    keywords: ["quote", "blockquote", "cite"],
    icon: <Quote size={16} />,
    kind: "sync",
    run: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    id: "code",
    label: "Code block",
    hint: "```",
    keywords: ["code", "block", "snippet", "pre"],
    icon: <Code2 size={16} />,
    kind: "sync",
    run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    id: "table",
    label: "Table",
    hint: "3×3",
    keywords: ["table", "grid", "rows"],
    icon: <TableIcon size={16} />,
    kind: "sync",
    run: (editor) =>
      editor.chain().focus()
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
  {
    id: "image",
    label: "Image",
    hint: "URL",
    keywords: ["image", "img", "picture", "photo"],
    icon: <ImageIcon size={16} />,
    kind: "sync",
    run: (editor) => {
      const url = window.prompt("Image URL");
      if (!url) return;
      editor.chain().focus().setImage({ src: url }).run();
    },
  },
  {
    id: "hr",
    label: "Divider",
    hint: "---",
    keywords: ["divider", "separator", "hr", "horizontal", "rule"],
    icon: <Minus size={16} />,
    kind: "sync",
    run: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
  // ===== AI items — operate on the parent block, replace it with the
  // result. Subprocess via `claude -p` (locked 2026-04-26). =====
  {
    id: "ai-summarize",
    label: "AI · Summarize",
    hint: "✨",
    keywords: ["ai", "summarize", "summary", "tldr", "concise"],
    icon: <Sparkles size={16} />,
    kind: "ai",
    system: "You are a concise editor. Summarize the user's text into 2-3 tight sentences. Keep the most important factual claims and remove every redundancy. Match the user's language.",
  },
  {
    id: "ai-expand",
    label: "AI · Expand",
    hint: "✨",
    keywords: ["ai", "expand", "elaborate", "flesh", "prose"],
    icon: <Wand2 size={16} />,
    kind: "ai",
    system: "You are a writing assistant. Expand the user's terse notes / bullets into a flowing paragraph of well-structured prose. Preserve every fact; do not invent new claims. Match the user's language.",
  },
  {
    id: "ai-translate-en",
    label: "AI · Translate to English",
    hint: "EN",
    keywords: ["ai", "translate", "english", "en"],
    icon: <Languages size={16} />,
    kind: "ai",
    system: "Translate the user's text into natural, fluent English. Preserve markdown formatting. Output only the translated text.",
  },
  {
    id: "ai-tableize",
    label: "AI · Convert to table",
    hint: "▦",
    keywords: ["ai", "table", "tableize", "structured", "grid"],
    icon: <Table2 size={16} />,
    kind: "ai",
    system: "Convert the user's text into a clean GitHub-flavored markdown table. Pick the most natural columns from the data. Output ONLY the markdown table, nothing else.",
  },
];

/**
 * Run an AI slash item against the parent block.
 * Picks the parent block's text, asks claude_inline_op for a transformation,
 * replaces the block with the result (parsed as markdown via tiptap-markdown).
 * Errors surface as a toast; the editor is not mutated on failure.
 */
async function runAiItem(editor: Editor, system: string): Promise<void> {
  const { state } = editor;
  const $from = state.selection.$from;
  // Depth 1 = the immediate block under doc. For nested blocks (e.g. a list
  // item) we still want the top-level block they live in for clean replace.
  const depth = 1;
  const blockStart = $from.before(depth);
  const blockEnd = $from.after(depth);
  const text = state.doc.textBetween(blockStart, blockEnd, "\n", "\n").trim();
  if (!text) {
    notify.err("Nothing to transform — write something in this block first.");
    return;
  }

  const toastId = notify.loading("Asking Claude…");
  try {
    const reply = await invoke<string>("claude_inline_op", {
      args: { system, content: text },
    });
    editor.chain().focus()
      .deleteRange({ from: blockStart, to: blockEnd })
      .insertContentAt(blockStart, reply)
      .run();
    notify.resolve(toastId, "Done");
  } catch (e) {
    notify.reject(toastId, "Couldn't transform with AI", e);
  }
}

function matches(item: Item, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (item.label.toLowerCase().includes(q)) return true;
  return item.keywords.some((k) => k.toLowerCase().includes(q));
}

type Props = { editor: Editor | null };

/**
 * Slash command menu (Notion-style).
 *
 * Triggered when the current paragraph starts with `/`. The query (text
 * after `/`) is read directly from the editor — no separate input. Arrow
 * keys / Enter / Escape are handled at window level while the menu is open
 * so the editor still receives normal text input.
 *
 * Selecting an item:
 *   1. removes the `/<query>` text from the editor
 *   2. runs the corresponding TipTap chain command
 */
export function MarkdownSlashMenu({ editor }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const startPosRef = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Detect `/<query>` at the start of the current paragraph, position the menu.
  useEffect(() => {
    if (!editor) return;
    const handleUpdate = () => {
      const { state, view } = editor;
      const { from, empty } = state.selection;
      if (!empty) { setOpen(false); return; }

      const $from = state.selection.$from;
      const paraStart = $from.start();
      const before = state.doc.textBetween(paraStart, from, "\n", "\n");

      const isPlainParagraph = $from.parent.type.name === "paragraph";
      if (
        isPlainParagraph &&
        before.length >= 1 &&
        before[0] === "/" &&
        before.length <= 25 &&
        !before.includes(" ") &&
        !before.includes("\n")
      ) {
        const q = before.slice(1);
        startPosRef.current = paraStart;
        setQuery(q);
        setSelectedIndex(0);
        const coords = view.coordsAtPos(from);
        setPos({ left: coords.left, top: coords.bottom + 4 });
        setOpen(true);
      } else {
        setOpen(false);
      }
    };

    editor.on("update", handleUpdate);
    editor.on("selectionUpdate", handleUpdate);
    return () => {
      editor.off("update", handleUpdate);
      editor.off("selectionUpdate", handleUpdate);
    };
  }, [editor]);

  const filtered = ITEMS.filter((i) => matches(i, query));

  // Clamp selected index when filter changes the visible set.
  useEffect(() => {
    if (selectedIndex >= filtered.length) setSelectedIndex(Math.max(0, filtered.length - 1));
  }, [filtered.length, selectedIndex]);

  // Keyboard nav while menu is open. Capture phase so we beat the editor.
  useEffect(() => {
    if (!open || !editor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault(); e.stopPropagation();
        setSelectedIndex((i) => Math.min(filtered.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault(); e.stopPropagation();
        setSelectedIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault(); e.stopPropagation();
        const item = filtered[selectedIndex];
        if (item) runItem(item);
      } else if (e.key === "Escape") {
        e.preventDefault(); e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, filtered, selectedIndex, editor]);

  // Scroll selected row into view.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [open, selectedIndex]);

  if (!open || !editor || !pos) return null;

  const runItem = (item: Item) => {
    const start = startPosRef.current;
    // Always strip the "/<query>" trigger first.
    if (start !== null) {
      const { from } = editor.state.selection;
      editor.chain().focus().deleteRange({ from: start, to: from }).run();
    }
    setOpen(false);
    if (item.kind === "sync") {
      item.run(editor);
    } else {
      void runAiItem(editor, item.system);
    }
  };

  return (
    <div
      className="arasul-md-slash"
      style={{ left: pos.left, top: pos.top }}
      role="listbox"
      aria-label="Insert block"
    >
      <div className="arasul-md-slash-list" ref={listRef}>
        {filtered.length === 0 && (
          <div className="arasul-md-slash-empty">No matches.</div>
        )}
        {filtered.map((item, idx) => (
          <button
            key={item.id}
            type="button"
            data-idx={idx}
            role="option"
            aria-selected={idx === selectedIndex}
            className={
              "arasul-md-slash-item" + (idx === selectedIndex ? " selected" : "")
            }
            onMouseEnter={() => setSelectedIndex(idx)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runItem(item)}
          >
            <span className="arasul-md-slash-icon">{item.icon}</span>
            <span className="arasul-md-slash-label">{item.label}</span>
            <span className="arasul-md-slash-hint">{item.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
