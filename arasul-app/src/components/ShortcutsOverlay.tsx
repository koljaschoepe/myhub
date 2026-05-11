import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import "./ShortcutsOverlay.css";

type Section = { title: string; rows: [string, string][] };

const SECTIONS: Section[] = [
  {
    title: "Workspace",
    rows: [
      ["⌘ K",         "Command palette"],
      ["⌘ P",         "Quick-open file"],
      ["⌘ ⇧ P",       "Switch project"],
      ["⌘ ⇧ F",       "Search across files"],
      ["⌘ ,",         "Settings"],
      ["⌘ /",         "This shortcuts sheet"],
      ["⌘ ;",         "Toggle focus mode (minimal UI)"],
      ["Esc",         "Close palette / modal"],
    ],
  },
  {
    title: "Editor",
    rows: [
      ["⌘ S",         "Save (markdown is also auto-saved)"],
      ["⌘ B / I / U", "Bold / Italic / Underline"],
      ["⌘ .",         "Toggle markdown toolbar (compact)"],
      ["⌘ ⇧ M",       "Toggle markdown source mode"],
      ["/",           "Slash menu (block insert)"],
      ["⌘ F",         "Find — code editor, terminal, or markdown source"],
    ],
  },
  {
    title: "View",
    rows: [
      ["⌘ +",         "Zoom in (PDF / image preview)"],
      ["⌘ −",         "Zoom out (PDF / image preview)"],
      ["⌘ 0",         "Reset zoom"],
    ],
  },
  {
    title: "Terminal",
    rows: [
      ["⌘ T",         "New terminal tab"],
      ["⌘ W",         "Close current tab"],
      ["⌘ 1 – 9",     "Switch terminal tab"],
    ],
  },
  {
    title: "Drive lock",
    rows: [
      ["⌘ L",         "Focus AI (right pane)"],
      ["⌘ ⇧ L",       "Lock drive"],
      ["Enter",       "Submit passphrase"],
    ],
  },
];

const COLLAPSE_KEY = "arasul.shortcutsCollapsed";

function loadCollapsed(): Set<string> {
  try {
    const raw = window.localStorage.getItem(COLLAPSE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.filter((s) => typeof s === "string") : []);
  } catch { return new Set(); }
}
function saveCollapsed(s: Set<string>) {
  try { window.localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...s])); }
  catch { /* ignore */ }
}

export function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<Element | null>(null);
  // Phase 7.9 (2026-05-11): search field + collapsible sections.
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed);

  const toggleCollapsed = (title: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      saveCollapsed(next);
      return next;
    });
  };

  // Filter rows by query (matches against keys or description). When
  // a query is active, all sections auto-expand so matches stay
  // visible even if the user collapsed them earlier.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS
      .map((s) => ({
        ...s,
        rows: s.rows.filter(
          ([k, d]) => k.toLowerCase().includes(q) || d.toLowerCase().includes(q),
        ),
      }))
      .filter((s) => s.rows.length > 0);
  }, [query]);

  useEffect(() => {
    lastFocused.current = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      if (lastFocused.current instanceof HTMLElement) {
        try { lastFocused.current.focus(); } catch { /* ignore */ }
      }
    };
  }, []);

  // Trap Tab inside the dialog. ESC closes via App's global handler.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusable = root.querySelectorAll<HTMLElement>(
        'button, [href], input, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className="arasul-shortcuts-overlay"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="arasul-shortcuts"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="arasul-shortcuts-head">
          <h2 id="shortcuts-title">Keyboard shortcuts</h2>
          <button
            type="button"
            className="arasul-shortcuts-close"
            aria-label="Close shortcuts"
            onClick={onClose}
          >×</button>
        </div>
        {/* Phase 7.9: search field. Auto-expands every section when
            non-empty so matches aren't hidden by a collapsed group. */}
        <div className="arasul-shortcuts-search">
          <Search size={12} aria-hidden="true" />
          <input
            type="text"
            placeholder="Search shortcuts…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter shortcuts"
            autoFocus
          />
        </div>
        <div className="arasul-shortcuts-body">
          {filtered.length === 0 && (
            <p className="arasul-shortcuts-empty">No shortcuts match.</p>
          )}
          {filtered.map((s) => {
            const isCollapsed = !query && collapsed.has(s.title);
            return (
              <section key={s.title}>
                <h3>
                  <button
                    type="button"
                    className="arasul-shortcuts-section-toggle"
                    onClick={() => toggleCollapsed(s.title)}
                    aria-expanded={!isCollapsed}
                    disabled={!!query}
                  >
                    <span className="arasul-shortcuts-section-chev" aria-hidden="true">
                      {isCollapsed ? "▸" : "▾"}
                    </span>
                    {s.title}
                    <span className="arasul-shortcuts-section-count">
                      {s.rows.length}
                    </span>
                  </button>
                </h3>
                {!isCollapsed && (
                  <dl>
                    {s.rows.map(([keys, desc]) => (
                      <div key={keys}>
                        <dt>
                          {keys.split(" ").map((k, i) =>
                            k === "/" ? <kbd key={i}>/</kbd> : <kbd key={i}>{k}</kbd>
                          )}
                        </dt>
                        <dd>{desc}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
