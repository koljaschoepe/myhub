import { useEffect, useRef } from "react";
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
    title: "Terminal",
    rows: [
      ["⌘ T",         "New terminal tab"],
      ["⌘ W",         "Close current tab"],
      ["⌘ 1 – 9",     "Switch terminal tab"],
    ],
  },
  {
    title: "Vault",
    rows: [
      ["⌘ L",         "Lock vault"],
      ["Enter",       "Submit passphrase"],
    ],
  },
];

export function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<Element | null>(null);

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
        <div className="arasul-shortcuts-body">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h3>{s.title}</h3>
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
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
