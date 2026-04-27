import { useEffect } from "react";
import type { RefObject } from "react";

/**
 * Trap Tab focus inside the given container while it's mounted.
 * Restores focus to the previously-active element on unmount.
 *
 * Apply once per modal/dialog. The container ref must be stable. The
 * container should also be a reachable focus target (tabIndex={-1} OK)
 * so initial focus can land inside.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active = true) {
  useEffect(() => {
    if (!active) return;
    const last = document.activeElement as HTMLElement | null;
    const root = ref.current;
    if (root) {
      // If nothing inside is focused yet, focus the container itself.
      if (!root.contains(document.activeElement)) {
        const focusables = getFocusable(root);
        (focusables[0] ?? root).focus();
      }
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const node = ref.current;
      if (!node) return;
      const focusables = getFocusable(node);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
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
    return () => {
      window.removeEventListener("keydown", onKey);
      try { last?.focus(); } catch { /* element may have unmounted */ }
    };
  }, [ref, active]);
}

function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  ));
}
