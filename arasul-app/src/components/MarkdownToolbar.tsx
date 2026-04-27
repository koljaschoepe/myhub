import type { Editor } from "@tiptap/react";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, ListTodo,
  Quote, Code, Code2, Link as LinkIcon, Image as ImageIcon,
  Table as TableIcon, Minus, ChevronDown, PanelTopClose,
  FileText, Eye,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";

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
 */
export function MarkdownToolbar({
  editor,
  onCompactToggle,
  sourceMode,
  onSourceToggle,
}: Props) {
  if (!editor) return null;

  const can = editor.can().chain().focus();
  const is = (name: string, attrs?: Record<string, unknown>) =>
    editor.isActive(name, attrs);

  return (
    <div className="arasul-md-toolbar" role="toolbar" aria-label="Formatting">
      <ToolbarGroup>
        <HeadingPicker editor={editor} />
      </ToolbarGroup>

      <Separator />

      <ToolbarGroup>
        <ToolbarBtn
          label="Bold (⌘B)"
          icon={<Bold size={16} />}
          active={is("bold")}
          disabled={!can.toggleBold().run()}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolbarBtn
          label="Italic (⌘I)"
          icon={<Italic size={16} />}
          active={is("italic")}
          disabled={!can.toggleItalic().run()}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarBtn
          label="Underline (⌘U)"
          icon={<UnderlineIcon size={16} />}
          active={is("underline")}
          disabled={!can.toggleUnderline?.().run()}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        />
        <ToolbarBtn
          label="Strikethrough"
          icon={<Strikethrough size={16} />}
          active={is("strike")}
          disabled={!can.toggleStrike().run()}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        />
        <ToolbarBtn
          label="Inline code"
          icon={<Code size={16} />}
          active={is("code")}
          disabled={!can.toggleCode().run()}
          onClick={() => editor.chain().focus().toggleCode().run()}
        />
      </ToolbarGroup>

      <Separator />

      <ToolbarGroup>
        <ToolbarBtn
          label="Bullet list"
          icon={<List size={16} />}
          active={is("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarBtn
          label="Numbered list"
          icon={<ListOrdered size={16} />}
          active={is("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarBtn
          label="Task list"
          icon={<ListTodo size={16} />}
          active={is("taskList")}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
        />
        <ToolbarBtn
          label="Quote"
          icon={<Quote size={16} />}
          active={is("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        />
      </ToolbarGroup>

      <Separator />

      <ToolbarGroup>
        <ToolbarBtn
          label="Code block"
          icon={<Code2 size={16} />}
          active={is("codeBlock")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        />
        <ToolbarBtn
          label="Link"
          icon={<LinkIcon size={16} />}
          active={is("link")}
          onClick={() => promptLink(editor)}
        />
        <ToolbarBtn
          label="Image"
          icon={<ImageIcon size={16} />}
          onClick={() => promptImage(editor)}
        />
        <ToolbarBtn
          label="Table"
          icon={<TableIcon size={16} />}
          onClick={() => editor.chain().focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run()
          }
        />
        <ToolbarBtn
          label="Horizontal rule"
          icon={<Minus size={16} />}
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        />
      </ToolbarGroup>

      <div className="arasul-md-toolbar-spacer" />

      {onSourceToggle && (
        <ToolbarBtn
          label={sourceMode ? "Rendered view (⌘⇧M)" : "Source view (⌘⇧M)"}
          icon={sourceMode ? <Eye size={16} /> : <FileText size={16} />}
          active={sourceMode}
          onClick={onSourceToggle}
        />
      )}
      {onCompactToggle && (
        <ToolbarBtn
          label="Hide toolbar (⌘.)"
          icon={<PanelTopClose size={16} />}
          onClick={onCompactToggle}
        />
      )}
    </div>
  );
}

function ToolbarGroup({ children }: { children: React.ReactNode }) {
  return <div className="arasul-md-toolbar-group">{children}</div>;
}

function Separator() {
  return <span className="arasul-md-toolbar-sep" aria-hidden="true" />;
}

function ToolbarBtn({
  label, icon, active, disabled, onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={"arasul-md-toolbar-btn" + (active ? " active" : "")}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}  /* keep editor focus */
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

/* --- Heading picker (dropdown) ----------------------------------- */

function HeadingPicker({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
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
        type="button"
        className="arasul-md-toolbar-btn arasul-md-heading-trigger"
        title="Heading style"
        aria-haspopup="listbox"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{label}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="arasul-md-heading-menu" role="listbox">
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
      className={"arasul-md-heading-item" + (active ? " active" : "")}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
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
