import { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { StarterKit } from "@tiptap/starter-kit";
import { Underline } from "@tiptap/extension-underline";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Link } from "@tiptap/extension-link";
import { Image } from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Typography } from "@tiptap/extension-typography";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { Markdown } from "tiptap-markdown";
import { common, createLowlight } from "lowlight";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Code, Link as LinkIcon,
} from "lucide-react";
import { MarkdownToolbar } from "./MarkdownToolbar";
import { MarkdownSlashMenu } from "./MarkdownSlashMenu";
import { Callouts } from "./markdownExtensions/Callouts";
import { notify } from "../lib/toast";
import { useAppConfig } from "../hooks/useAppConfig";
import "./MarkdownEditor.css";

type MdStorage = { markdown?: { getMarkdown: () => string } };

const lowlight = createLowlight(common);

const COMPACT_KEY = "arasul.md.compact";
const SOURCE_KEY = "arasul.md.source";

type Props = { filePath: string };

/**
 * Always-on rendered markdown editor (Cursor/Notion style).
 *
 * Three formatting surfaces:
 *   - top toolbar (sticky, ~36px) — discoverability
 *   - bubble menu (on text selection) — power-user inline edits
 *   - slash menu (`/` at line start) — block-level inserts
 *
 * No raw-source toggle yet (Phase D). Round-trip via tiptap-markdown
 * (markdown → ProseMirror → markdown).
 *
 * Save policy:
 *   - 1000ms debounce on change
 *   - ⌘S / Ctrl+S immediate
 *   - file switch flushes pending save (path-bound closure)
 *   - on unmount, pending timer is cleared and a final save fires
 */
export function MarkdownEditor({ filePath }: Props) {
  const [status, setStatus] = useState<"clean" | "saving" | "saved" | "dirty" | "error">("clean");
  const saveTimer = useRef<{ id: number; path: string } | null>(null);
  const lastSavedSource = useRef<string>("");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [stats, setStats] = useState({ words: 0, chars: 0, selectedWords: 0 });
  const [inlineAi, setInlineAi] = useState<
    | { from: number; to: number; original: string; top: number; left: number }
    | null
  >(null);
  const [aiPending, setAiPending] = useState(false);
  const [compact, setCompact] = useState<boolean>(() => {
    try { return window.localStorage.getItem(COMPACT_KEY) === "1"; }
    catch { return false; }
  });
  const editorPrefs = useAppConfig().editor;
  const [sourceMode, setSourceMode] = useState<boolean>(() => {
    try {
      const stored = window.localStorage.getItem(SOURCE_KEY);
      if (stored === "1") return true;
      if (stored === "0") return false;
    } catch { /* ignore */ }
    return false;
  });
  // Re-apply default_view from settings when no localStorage choice exists.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(SOURCE_KEY) === null && editorPrefs.default_view === "source") {
        setSourceMode(true);
      }
    } catch { /* ignore */ }
  }, [editorPrefs.default_view]);
  const [sourceText, setSourceText] = useState<string>("");
  const sourceModeRef = useRef(sourceMode);
  sourceModeRef.current = sourceMode;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // we provide the lowlight-backed one below
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
      Underline,
      Typography,
      Callouts,
      Placeholder.configure({
        placeholder: "Start writing… (or type `/` for blocks)",
      }),
      CodeBlockLowlight.configure({ lowlight }),
      Link.configure({ openOnClick: false, autolink: true }),
      Image,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      Markdown.configure({
        html: false,
        breaks: true,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: "",
    autofocus: "end",
    immediatelyRender: false,
    editorProps: {
      handlePaste(view, event) {
        // Phase E: clipboard image paste. Embed as base64 data: URL —
        // immediately portable, no Rust round-trip. Disk-backed
        // attachments arrive in Phase F (custom NodeView).
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          if (it.kind === "file" && it.type.startsWith("image/")) {
            const file = it.getAsFile();
            if (!file) continue;
            event.preventDefault();
            const reader = new FileReader();
            reader.onload = () => {
              const src = reader.result as string;
              if (typeof src !== "string") return;
              const { state, dispatch } = view;
              const node = state.schema.nodes.image.create({ src });
              dispatch(state.tr.replaceSelectionWith(node));
            };
            reader.readAsDataURL(file);
            return true;
          }
        }
        return false;
      },
    },
  });

  // Save with the path captured at the time of the change — never reads
  // current filePath at fire time, so a late-firing timer can't write to
  // the wrong file.
  const save = useCallback(async (path: string, source: string) => {
    if (source === lastSavedSource.current) return;
    setStatus("saving");
    try {
      await invoke("write_file", { path, content: source });
      lastSavedSource.current = source;
      setLastSavedAt(Date.now());
      setStatus("saved");
      window.setTimeout(() => setStatus((s) => (s === "saved" ? "clean" : s)), 1200);
    } catch (e) {
      console.error("write_file failed:", e);
      setStatus("error");
      notify.err("Couldn't save your changes", e);
    }
  }, []);

  // Load on mount and when filePath changes.
  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    (async () => {
      try {
        const text = await invoke<string>("read_file", { path: filePath });
        if (cancelled) return;
        editor.commands.setContent(text, { emitUpdate: false });
        setSourceText(text);
        lastSavedSource.current = text;
        setStatus("clean");
      } catch (e) {
        if (cancelled) return;
        console.error("read_file failed:", e);
        const err = `# Failed to read file\n\n\`\`\`\n${e}\n\`\`\``;
        editor.commands.setContent(err, { emitUpdate: false });
        setSourceText(err);
        notify.err("Couldn't open the file", e);
      }
    })();
    return () => { cancelled = true; };
  }, [editor, filePath]);

  // Subscribe to updates → autosave debounce + word/char count.
  useEffect(() => {
    if (!editor) return;
    let statsTimer: number | undefined;
    const onUpdate = () => {
      // While in source mode, CodeMirror owns the document — TipTap is
      // only kept in sync for round-trip. Skip its update handler so we
      // don't double-save or fight the user's CodeMirror cursor.
      if (sourceModeRef.current) return;
      const storage = editor.storage as unknown as MdStorage;
      const source = storage.markdown?.getMarkdown() ?? editor.getText();
      setStatus("dirty");
      if (saveTimer.current) window.clearTimeout(saveTimer.current.id);
      const path = filePath;
      const id = window.setTimeout(() => {
        void save(path, source);
        if (saveTimer.current?.id === id) saveTimer.current = null;
      }, 1000);
      saveTimer.current = { id, path };

      // Lightweight stats — debounced 200ms so heavy-typists don't see
      // counter flicker on every keystroke.
      if (statsTimer) window.clearTimeout(statsTimer);
      statsTimer = window.setTimeout(() => {
        const text = editor.getText();
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        setStats((s) => ({ ...s, words, chars: text.length }));
      }, 200);
    };
    editor.on("update", onUpdate);
    return () => {
      editor.off("update", onUpdate);
      if (statsTimer) window.clearTimeout(statsTimer);
    };
  }, [editor, filePath, save]);

  // Initial stats once content is loaded.
  useEffect(() => {
    if (!editor) return;
    const text = editor.getText();
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    setStats({ words, chars: text.length, selectedWords: 0 });
  }, [editor, filePath]);

  // Track selection word-count for the footer ("47 words selected").
  useEffect(() => {
    if (!editor) return;
    const onSelection = () => {
      const { from, to, empty } = editor.state.selection;
      if (empty) {
        setStats((s) => s.selectedWords === 0 ? s : { ...s, selectedWords: 0 });
        return;
      }
      const slice = editor.state.doc.textBetween(from, to, " ");
      const w = slice.trim() ? slice.trim().split(/\s+/).length : 0;
      setStats((s) => s.selectedWords === w ? s : { ...s, selectedWords: w });
    };
    editor.on("selectionUpdate", onSelection);
    return () => { editor.off("selectionUpdate", onSelection); };
  }, [editor]);

  // ⌘S — immediate save (path-bound, sources from whichever editor is
  // currently active). ⌘. — compact toggle. ⌘⇧M — source-mode toggle.
  useEffect(() => {
    if (!editor) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        const source = sourceModeRef.current
          ? sourceText
          : (editor.storage as unknown as MdStorage).markdown?.getMarkdown() ?? editor.getText();
        if (saveTimer.current) {
          window.clearTimeout(saveTimer.current.id);
          saveTimer.current = null;
        }
        void save(filePath, source);
      } else if (mod && e.key === ".") {
        e.preventDefault();
        toggleCompact();
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "m") {
        e.preventDefault();
        toggleSourceMode();
      } else if (mod && !e.shiftKey && !sourceModeRef.current && e.key.toLowerCase() === "b") {
        e.preventDefault();
        editor.chain().focus().toggleBold().run();
      } else if (mod && !e.shiftKey && !sourceModeRef.current && e.key.toLowerCase() === "i") {
        e.preventDefault();
        editor.chain().focus().toggleItalic().run();
      } else if (mod && !e.shiftKey && !sourceModeRef.current && e.key.toLowerCase() === "u") {
        e.preventDefault();
        editor.chain().focus().toggleUnderline().run();
      } else if (mod && !e.shiftKey && e.key.toLowerCase() === "f" && !sourceModeRef.current) {
        // ⌘F in WYSIWYG mode — flip to source mode so CodeMirror's built-in
        // search overlay handles the find. The user can ⌘⇧M back to WYSIWYG.
        // TipTap doesn't have native find yet (Phase 6 stretch).
        const sel = window.getSelection?.()?.toString() ?? "";
        const editorEl = (e.target as HTMLElement)?.closest?.(".arasul-md-editor");
        if (!editorEl) return;
        e.preventDefault();
        toggleSourceMode();
        // After CM mounts, its searchKeymap fires on the next ⌘F press.
        // For now we let the user press ⌘F a second time inside CM.
        if (sel) console.debug("[md] handing selection to source-mode search:", sel.slice(0, 40));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editor, filePath, save, sourceText]);

  // ⌘K inline AI — capture phase so we beat App.tsx's palette opener when
  // the editor has a non-empty selection. With no selection we don't
  // preventDefault, so the global ⌘K palette still works.
  useEffect(() => {
    if (!editor) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.shiftKey || e.altKey) return;
      if (e.key.toLowerCase() !== "k") return;
      if (sourceModeRef.current) return;
      const { from, to, empty } = editor.state.selection;
      if (empty) return; // let App.tsx open the palette
      const editorEl = editor.view.dom;
      const active = document.activeElement as HTMLElement | null;
      if (!editorEl.contains(active)) return; // editor not focused → palette
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const original = editor.state.doc.textBetween(from, to, "\n", "\n");
      const coords = editor.view.coordsAtPos(to);
      setInlineAi({ from, to, original, top: coords.bottom + 6, left: coords.left });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [editor]);

  // Inject hover-only Copy buttons into every <pre>. Outside the
  // ProseMirror schema (CSS-driven appearance via .arasul-md-copy in
  // MarkdownEditor.css) so it doesn't fight TipTap's selection. Idempotent —
  // re-runs on every editor update, but only adds buttons where missing.
  useEffect(() => {
    if (!editor) return;
    const root = editor.view.dom as HTMLElement;
    const sync = () => {
      root.querySelectorAll<HTMLPreElement>("pre").forEach((pre) => {
        if (pre.querySelector(".arasul-md-copy")) return;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "arasul-md-copy";
        btn.textContent = "Copy";
        btn.contentEditable = "false";
        btn.setAttribute("aria-label", "Copy code");
        btn.addEventListener("mousedown", (e) => e.preventDefault());
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const code = pre.querySelector("code")?.textContent ?? pre.textContent ?? "";
          void navigator.clipboard.writeText(code).then(() => {
            btn.textContent = "Copied";
            btn.classList.add("copied");
            window.setTimeout(() => {
              btn.textContent = "Copy";
              btn.classList.remove("copied");
            }, 1500);
          }).catch((err) => notify.err("Couldn't copy code", err));
        });
        pre.appendChild(btn);
      });
    };
    sync();
    editor.on("update", sync);
    return () => { editor.off("update", sync); };
  }, [editor]);

  // Final flush on unmount — covers project switch + tab close while dirty.
  // Surfacing errors here matters: this is the last save before the editor
  // is gone. If it fails, the user has lost work and must know.
  useEffect(() => () => {
    const t = saveTimer.current;
    if (!t) return;
    window.clearTimeout(t.id);
    saveTimer.current = null;
    if (editor) {
      const storage = editor.storage as unknown as MdStorage;
      const source = storage.markdown?.getMarkdown() ?? editor.getText();
      void invoke("write_file", { path: t.path, content: source }).catch((e) => {
        notify.err(`Couldn't save ${t.path.split("/").pop() ?? "file"}`, e);
      });
    }
  }, [editor]);

  const toggleCompact = useCallback(() => {
    setCompact((c) => {
      const next = !c;
      try { window.localStorage.setItem(COMPACT_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const toggleSourceMode = useCallback(() => {
    if (!editor) return;
    setSourceMode((cur) => {
      const next = !cur;
      try { window.localStorage.setItem(SOURCE_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      if (next) {
        // Entering source mode: snapshot TipTap's markdown into CM.
        const md = (editor.storage as unknown as MdStorage).markdown?.getMarkdown() ?? editor.getText();
        setSourceText(md);
      } else {
        // Leaving source mode: push CM's text into TipTap silently and
        // schedule a save. emitUpdate=false avoids the listener-skip
        // dance — we already know the content changed.
        editor.commands.setContent(sourceText, { emitUpdate: false });
        if (sourceText !== lastSavedSource.current) {
          if (saveTimer.current) window.clearTimeout(saveTimer.current.id);
          saveTimer.current = null;
          void save(filePath, sourceText);
        }
      }
      return next;
    });
  }, [editor, sourceText, filePath, save]);

  // CodeMirror change handler — debounced save when in source mode.
  const onSourceChange = useCallback((value: string) => {
    setSourceText(value);
    setStatus("dirty");
    if (saveTimer.current) window.clearTimeout(saveTimer.current.id);
    const path = filePath;
    const id = window.setTimeout(() => {
      void save(path, value);
      if (saveTimer.current?.id === id) saveTimer.current = null;
    }, 1000);
    saveTimer.current = { id, path };
  }, [filePath, save]);

  return (
    <div className={"arasul-md-editor"
      + (compact ? " compact" : "")
      + (sourceMode ? " source" : "")
    }>
      {!compact && (
        <MarkdownToolbar
          editor={editor}
          onCompactToggle={toggleCompact}
          sourceMode={sourceMode}
          onSourceToggle={toggleSourceMode}
        />
      )}
      {sourceMode ? (
        <div className="arasul-md-source">
          <CodeMirror
            value={sourceText}
            height="100%"
            theme="dark"
            extensions={[
              markdown(),
              ...(editorPrefs.word_wrap ? [EditorView.lineWrapping] : []),
              EditorView.theme({
                "&": {
                  backgroundColor: "var(--bg-canvas)",
                  color: "var(--text-primary)",
                  height: "100%",
                  fontSize: `${editorPrefs.font_size}px`,
                },
                ".cm-scroller": {
                  fontFamily: "var(--font-mono)",
                  lineHeight: "1.7",
                  padding: "20px 0",
                },
                ".cm-content": {
                  maxWidth: "var(--measure)",
                  margin: "0 auto",
                  padding: "0 28px",
                },
                ".cm-cursor": { borderLeftColor: "var(--accent)" },
                ".cm-selectionBackground": { backgroundColor: "var(--accent-soft) !important" },
              }, { dark: true }),
            ]}
            basicSetup={{ lineNumbers: false, foldGutter: false, autocompletion: false }}
            onChange={onSourceChange}
          />
        </div>
      ) : (
        <EditorContent editor={editor} className="arasul-md-canvas" />
      )}
      {!sourceMode && editor && (
        <BubbleMenu editor={editor} className="arasul-md-bubble">
          <BubbleBtn
            label="Bold"
            icon={<Bold size={14} />}
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
          />
          <BubbleBtn
            label="Italic"
            icon={<Italic size={14} />}
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          />
          <BubbleBtn
            label="Underline"
            icon={<UnderlineIcon size={14} />}
            active={editor.isActive("underline")}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          />
          <BubbleBtn
            label="Strike"
            icon={<Strikethrough size={14} />}
            active={editor.isActive("strike")}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          />
          <BubbleBtn
            label="Code"
            icon={<Code size={14} />}
            active={editor.isActive("code")}
            onClick={() => editor.chain().focus().toggleCode().run()}
          />
          <BubbleBtn
            label="Link"
            icon={<LinkIcon size={14} />}
            active={editor.isActive("link")}
            onClick={() => {
              const prev = editor.getAttributes("link").href as string | undefined;
              const url = window.prompt("Link URL", prev ?? "https://");
              if (url === null) return;
              if (url === "") editor.chain().focus().extendMarkRange("link").unsetLink().run();
              else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
            }}
          />
        </BubbleMenu>
      )}
      {!sourceMode && <MarkdownSlashMenu editor={editor} />}
      {!sourceMode && inlineAi && editor && (
        <InlineAiPrompt
          top={inlineAi.top}
          left={inlineAi.left}
          pending={aiPending}
          onCancel={() => setInlineAi(null)}
          onSubmit={async (prompt) => {
            if (!prompt.trim()) return;
            setAiPending(true);
            try {
              const reply = await invoke<string>("claude_inline_op", {
                args: {
                  system: `You are an inline editor inside a markdown document. The user selected a piece of their text and asked: "${prompt.trim()}". Apply the request and return ONLY the transformed text, no preamble or commentary.`,
                  content: inlineAi.original,
                },
              });
              editor.chain().focus()
                .deleteRange({ from: inlineAi.from, to: inlineAi.to })
                .insertContentAt(inlineAi.from, reply)
                .run();
              setInlineAi(null);
            } catch (e) {
              notify.err("Couldn't apply AI edit", e);
            } finally {
              setAiPending(false);
            }
          }}
        />
      )}
      <div className="arasul-md-footstats" aria-live="polite">
        <span className="arasul-md-savetime">
          {status === "saving" ? "saving…" :
           status === "error"  ? "save failed" :
           lastSavedAt         ? `saved · ${formatRelative(lastSavedAt)}` :
                                 ""}
        </span>
        <span className="arasul-md-wordcount">
          {stats.selectedWords > 0
            ? `${stats.selectedWords.toLocaleString()} ${stats.selectedWords === 1 ? "word" : "words"} selected`
            : `${stats.words.toLocaleString()} words · ${stats.chars.toLocaleString()} chars · ${formatReadingTime(stats.words)}`}
        </span>
      </div>
      <span
        className={"arasul-md-statusdot arasul-md-statusdot-" + status}
        title={status}
      />
    </div>
  );
}

/** Compact "x s/min/h ago" formatter for the saved indicator. */
function formatRelative(ts: number): string {
  const sec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return new Date(ts).toLocaleDateString();
}

/** Reading-time estimate at 250 wpm (Medium / Substack convention). */
function formatReadingTime(words: number): string {
  if (words < 50) return "< 1 min read";
  const min = Math.max(1, Math.round(words / 250));
  return `${min} min read`;
}

function InlineAiPrompt({
  top, left, pending, onSubmit, onCancel,
}: {
  top: number;
  left: number;
  pending: boolean;
  onSubmit: (prompt: string) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  return (
    <div
      className="arasul-md-aibox"
      style={{ top, left }}
      role="dialog"
      aria-label="AI edit selection"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span className="arasul-md-aibox-icon" aria-hidden>✨</span>
      <input
        ref={inputRef}
        type="text"
        className="arasul-md-aibox-input"
        placeholder="Ask Claude to edit your selection…"
        value={value}
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel(); }
          else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); void onSubmit(value); }
        }}
      />
      <span className="arasul-md-aibox-hint">{pending ? "thinking…" : "↵ to apply · Esc to cancel"}</span>
    </div>
  );
}

function BubbleBtn({
  label, icon, active, onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={"arasul-md-bubble-btn" + (active ? " active" : "")}
      title={label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}
