import type { Editor } from "@tiptap/react";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, ListTodo,
  Quote, Code, Code2, Link as LinkIcon, Image as ImageIcon,
  Table as TableIcon, Minus, ChevronDown, PanelTopClose,
  FileText, Eye,
} from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

type Props = {
  editor: Editor | null;
  onCompactToggle?: () => void;
  sourceMode?: boolean;
  onSourceToggle?: () => void;
};

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;
type HeadingLevel = (typeof HEADING_LEVELS)[number];

/**
 * Sticky top toolbar for the Markdown editor.
 *
 * Discoverability surface — every formatting feature is visible. Power
 * users have the bubble menu (selection) and slash menu (`/` at line
 * start) for the same actions without travelling to the toolbar.
 *
 * Phase 2.6 (2026-05-11) — a11y wired to W3C ARIA Authoring Practices:
 *   - Roving tabindex: only one button in the page tab order at any time.
 *     Arrow Left/Right/Home/End walk the toolbar; Tab leaves to the next
 *     focusable element after the toolbar.
 *   - Alt+F10 (Windows/Linux convention) and Cmd+F10 (Mac) focus the
 *     toolbar from anywhere in the editor surface. Escape returns focus
 *     to the editor.
 *   - aria-pressed reflects active mark state (was already set).
 *   - Polite live region announces toggles ("Bold on" / "Bold off") so
 *     screen readers report formatting changes that happen via keyboard
 *     shortcuts (⌘B, ⌘I, ⌘U) or toolbar clicks.
 */
export function MarkdownToolbar({
  editor,
  onCompactToggle,
  sourceMode,
  onSourceToggle,
}: Props) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  // Roving tabindex: which button is currently in tab order. Updated by
  // arrow keys + clicks. Initial 0 = first focusable.
  const [activeIndex, setActiveIndex] = useState(0);
  // Polite SR announcement when a mark toggles. Cleared 1s after set so
  // the same mark toggled twice in a row still announces.
  const [announce, setAnnounce] = useState("");

  // Alt+F10 (PC) / Cmd+F10 (Mac) — focus the toolbar from inside the
  // editor. Listening at window level so the shortcut works regardless
  // of focus location, as long as the editor pane is mounted.
  useEffect(() => {
    if (!editor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F10") return;
      if (!(e.altKey || e.metaKey)) return;
      const tb = toolbarRef.current;
      if (!tb) return;
      e.preventDefault();
      const first = tb.querySelector<HTMLButtonElement>("button[tabindex='0'], button:not([tabindex='-1'])");
      first?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editor]);

  // Clear announcement so a repeated toggle re-announces.
  useEffect(() => {
    if (!announce) return;
    const t = setTimeout(() => setAnnounce(""), 1000);
    return () => clearTimeout(t);
  }, [announce]);

  const onToolbarKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    const tb = toolbarRef.current;
    if (!tb) return;
    const buttons = Array.from(
      tb.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
    );
    if (buttons.length === 0) return;
    const idx = buttons.findIndex((b) => b === document.activeElement);
    if (idx === -1) return;

    let next = idx;
    switch (e.key) {
      case "ArrowRight":
        next = (idx + 1) % buttons.length;
        break;
      case "ArrowLeft":
        next = (idx - 1 + buttons.length) % buttons.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = buttons.length - 1;
        break;
      case "Escape":
        e.preventDefault();
        editor?.commands.focus();
        return;
      default:
        return;
    }
    e.preventDefault();
    setActiveIndex(next);
    buttons[next]?.focus();
  }, [editor]);

  if (!editor) return null;

  const can = editor.can().chain().focus();
  const is = (name: string, attrs?: Record<string, unknown>) =>
    editor.isActive(name, attrs);

  const fire = (label: string, willBeActive: boolean, run: () => void) => {
    run();
    setAnnounce(`${label.split(" ")[0]} ${willBeActive ? "on" : "off"}`);
  };

  return (
    <div
      ref={toolbarRef}
      className="arasul-md-toolbar"
      role="toolbar"
      aria-label="Formatting"
      onKeyDown={onToolbarKeyDown}
      onFocus={(e) => {
        // Update roving index when focus enters via Tab.
        const tb = toolbarRef.current;
        if (!tb) return;
        const target = e.target as Element;
        const buttons = Array.from(tb.querySelectorAll<HTMLButtonElement>("button"));
        const i = buttons.findIndex((b) => b === target);
        if (i >= 0) setActiveIndex(i);
      }}
    >
      <ToolbarGroup>
        <HeadingPicker editor={editor} activeIndex={activeIndex} btnIndex={0} />
      </ToolbarGroup>

      <Separator />

      <ToolbarGroup>
        <ToolbarBtn
          index={1} activeIndex={activeIndex}
          label="Bold (⌘B)"
          icon={<Bold size={16} />}
          active={is("bold")}
          disabled={!can.toggleBold().run()}
          onClick={() => fire("Bold", !is("bold"), () => editor.chain().focus().toggleBold().run())}
        />
        <ToolbarBtn
          index={2} activeIndex={activeIndex}
          label="Italic (⌘I)"
          icon={<Italic size={16} />}
          active={is("italic")}
          disabled={!can.toggleItalic().run()}
          onClick={() => fire("Italic", !is("italic"), () => editor.chain().focus().toggleItalic().run())}
        />
        <ToolbarBtn
          index={3} activeIndex={activeIndex}
          label="Underline (⌘U)"
          icon={<UnderlineIcon size={16} />}
          active={is("underline")}
          disabled={!can.toggleUnderline?.().run()}
          onClick={() => fire("Underline", !is("underline"), () => editor.chain().focus().toggleUnderline().run())}
        />
        <ToolbarBtn
          index={4} activeIndex={activeIndex}
          label="Strikethrough"
          icon={<Strikethrough size={16} />}
          active={is("strike")}
          disabled={!can.toggleStrike().run()}
          onClick={() => fire("Strikethrough", !is("strike"), () => editor.chain().focus().toggleStrike().run())}
        />
        <ToolbarBtn
          index={5} activeIndex={activeIndex}
          label="Inline code"
          icon={<Code size={16} />}
          active={is("code")}
          disabled={!can.toggleCode().run()}
          onClick={() => fire("Inline code", !is("code"), () => editor.chain().focus().toggleCode().run())}
        />
      </ToolbarGroup>

      <Separator />

      <ToolbarGroup>
        <ToolbarBtn
          index={6} activeIndex={activeIndex}
          label="Bullet list"
          icon={<List size={16} />}
          active={is("bulletList")}
          onClick={() => fire("Bullet list", !is("bulletList"), () => editor.chain().focus().toggleBulletList().run())}
        />
        <ToolbarBtn
          index={7} activeIndex={activeIndex}
          label="Numbered list"
          icon={<ListOrdered size={16} />}
          active={is("orderedList")}
          onClick={() => fire("Numbered list", !is("orderedList"), () => editor.chain().focus().toggleOrderedList().run())}
        />
        <ToolbarBtn
          index={8} activeIndex={activeIndex}
          label="Task list"
          icon={<ListTodo size={16} />}
          active={is("taskList")}
          onClick={() => fire("Task list", !is("taskList"), () => editor.chain().focus().toggleTaskList().run())}
        />
        <ToolbarBtn
          index={9} activeIndex={activeIndex}
          label="Quote"
          icon={<Quote size={16} />}
          active={is("blockquote")}
          onClick={() => fire("Quote", !is("blockquote"), () => editor.chain().focus().toggleBlockquote().run())}
        />
      </ToolbarGroup>

      <Separator />

      <ToolbarGroup>
        <ToolbarBtn
          index={10} activeIndex={activeIndex}
          label="Code block"
          icon={<Code2 size={16} />}
          active={is("codeBlock")}
          onClick={() => fire("Code block", !is("codeBlock"), () => editor.chain().focus().toggleCodeBlock().run())}
        />
        <ToolbarBtn
          index={11} activeIndex={activeIndex}
          label="Link"
          icon={<LinkIcon size={16} />}
          active={is("link")}
          onClick={() => promptLink(editor)}
        />
        <ToolbarBtn
          index={12} activeIndex={activeIndex}
          label="Image"
          icon={<ImageIcon size={16} />}
          onClick={() => promptImage(editor)}
        />
        <ToolbarBtn
          index={13} activeIndex={activeIndex}
          label="Table"
          icon={<TableIcon size={16} />}
          onClick={() => editor.chain().focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run()
          }
        />
        <ToolbarBtn
          index={14} activeIndex={activeIndex}
          label="Horizontal rule"
          icon={<Minus size={16} />}
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        />
      </ToolbarGroup>

      <div className="arasul-md-toolbar-spacer" />

      {onSourceToggle && (
        <ToolbarBtn
          index={15} activeIndex={activeIndex}
          label={sourceMode ? "Rendered view (⌘⇧M)" : "Source view (⌘⇧M)"}
          icon={sourceMode ? <Eye size={16} /> : <FileText size={16} />}
          active={sourceMode}
          onClick={onSourceToggle}
        />
      )}
      {onCompactToggle && (
        <ToolbarBtn
          index={16} activeIndex={activeIndex}
          label="Hide toolbar (⌘.)"
          icon={<PanelTopClose size={16} />}
          onClick={onCompactToggle}
        />
      )}

      {/* Phase 2.6: polite SR announcer for formatting toggles. Hidden
          visually via sr-only; the aria-live region is read by AT when
          its content changes (e.g. user presses ⌘B → "Bold on"). */}
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announce}
      </span>
    </div>
  );
}

function ToolbarGroup({ children }: { children: React.ReactNode }) {
  return <div className="arasul-md-toolbar-group">{children}</div>;
}

function Separator() {
  return <span className="arasul-md-toolbar-sep" aria-hidden="true" />;
}

const ToolbarBtn = forwardRef<HTMLButtonElement, {
  index: number;
  activeIndex: number;
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}>(function ToolbarBtn({ index, activeIndex, label, icon, active, disabled, onClick }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={"arasul-md-toolbar-btn" + (active ? " active" : "")}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      tabIndex={index === activeIndex ? 0 : -1}
      onMouseDown={(e) => e.preventDefault()}  /* keep editor focus */
      onClick={onClick}
    >
      {icon}
    </button>
  );
});

/* --- Heading picker (dropdown) ----------------------------------- */

function HeadingPicker({
  editor,
  activeIndex,
  btnIndex,
}: {
  editor: Editor;
  activeIndex: number;
  btnIndex: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  // When the listbox opens, focus the active option so arrow keys take
  // over inside the menu without keyboard users having to mouse-click.
  useLayoutEffect(() => {
    if (!open) return;
    const menu = ref.current?.querySelector<HTMLElement>("[role='listbox']");
    const active = menu?.querySelector<HTMLElement>("[aria-selected='true']");
    (active ?? menu?.querySelector<HTMLElement>("[role='option']"))?.focus();
  }, [open]);

  const current: "body" | HeadingLevel = (() => {
    for (const lvl of HEADING_LEVELS) {
      if (editor.isActive("heading", { level: lvl })) return lvl;
    }
    return "body";
  })();

  const label = current === "body" ? "Body" : `H${current}`;

  return (
    <div className="arasul-md-heading-picker" ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        className="arasul-md-toolbar-btn arasul-md-heading-trigger"
        title="Heading style"
        aria-label="Heading style picker"
        aria-haspopup="listbox"
        aria-expanded={open}
        tabIndex={activeIndex === btnIndex ? 0 : -1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{label}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="arasul-md-heading-menu" role="listbox" aria-label="Heading levels">
          <HeadingItem
            label="Body"
            sample="Body text"
            active={current === "body"}
            onClick={() => {
              editor.chain().focus().setParagraph().run();
              setOpen(false);
            }}
          />
          {HEADING_LEVELS.map((lvl) => (
            <HeadingItem
              key={lvl}
              label={`Heading ${lvl}`}
              sample={`H${lvl} sample`}
              level={lvl}
              active={current === lvl}
              onClick={() => {
                editor.chain().focus().toggleHeading({ level: lvl }).run();
                setOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HeadingItem({
  label, sample, level, active, onClick,
}: {
  label: string;
  sample: string;
  level?: HeadingLevel;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      className={"arasul-md-heading-item" + (active ? " active" : "")}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <span className="arasul-md-heading-label">{label}</span>
      <span
        className="arasul-md-heading-sample"
        data-level={level ?? "body"}
      >
        {sample}
      </span>
    </button>
  );
}

/* --- Helpers ----------------------------------------------------- */

function promptLink(editor: Editor) {
  const prev = editor.getAttributes("link").href as string | undefined;
  const url = window.prompt("Link URL", prev ?? "https://");
  if (url === null) return;
  if (url === "") {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    return;
  }
  editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
}

function promptImage(editor: Editor) {
  const url = window.prompt("Image URL");
  if (!url) return;
  editor.chain().focus().setImage({ src: url }).run();
}
