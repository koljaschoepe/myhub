import { useEffect, useRef, useState, type ReactNode } from "react";
import "./ContextMenu.css";

export type MenuItem =
  | { type: "item"; label: string; onClick: () => void; destructive?: boolean; icon?: ReactNode }
  | { type: "separator" };

/**
 * Floating menu positioned at (x, y). Closes on outside-click / Escape /
 * window blur / item-click.
 *
 * B5 fix — we render the menu offscreen first, measure its real bounds
 * via getBoundingClientRect, then clamp so it always stays inside the
 * viewport. No heuristic-based width/height guesses.
 */
export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; measured: boolean }>({ x, y, measured: false });

  // Measure after first render, then clamp.
  useEffect(() => {
    if (pos.measured) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = 8;
    const clampedX = Math.max(pad, Math.min(x, vw - rect.width - pad));
    const clampedY = Math.max(pad, Math.min(y, vh - rect.height - pad));
    setPos({ x: clampedX, y: clampedY, measured: true });
  }, [x, y, pos.measured]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onBlur = () => onClose();
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="arasul-ctxmenu"
      style={{
        left: pos.x,
        top: pos.y,
        // Invisible until measured — avoids the flash of an off-screen menu.
        visibility: pos.measured ? "visible" : "hidden",
      }}
      role="menu"
    >
      {items.map((item, i) =>
        item.type === "separator" ? (
          <div key={`sep-${i}`} className="arasul-ctxmenu-sep" />
        ) : (
          <button
            key={`${i}-${item.label}`}
            className={"arasul-ctxmenu-item" + (item.destructive ? " destructive" : "")}
            onClick={() => { item.onClick(); onClose(); }}
            role="menuitem"
          >
            {item.icon && <span className="arasul-ctxmenu-icon">{item.icon}</span>}
            {item.label}
          </button>
        )
      )}
    </div>
  );
}
