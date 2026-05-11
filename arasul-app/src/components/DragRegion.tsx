/**
 * Phase 3.3 (2026-05-11) — DragRegion wrapper for native window dragging.
 *
 * Tauri 2 uses the `data-tauri-drag-region` attribute to mark a region
 * the user can grab to move the window. Interactive children (buttons,
 * inputs) opt out automatically — Tauri's hit-test walks up the DOM and
 * stops dragging if it encounters a clickable element.
 *
 * Use this wrapper for the title bar and any custom chrome that should
 * feel like part of the OS chrome. Don't wrap the entire app — only the
 * bands where drag-to-move is expected.
 *
 * Example:
 *   <DragRegion as="header" className="arasul-topbar">
 *     ...interactive children that work as normal...
 *   </DragRegion>
 */

import { forwardRef, type ElementType, type HTMLAttributes } from "react";

export interface DragRegionProps extends HTMLAttributes<HTMLElement> {
  /** Tag to render (default `div`). Pass "header" for the title bar. */
  as?: ElementType;
  /** Disable the drag attribute (e.g. for tests / when window-state is
   *  custom-managed). Default false. */
  disabled?: boolean;
}

export const DragRegion = forwardRef<HTMLElement, DragRegionProps>(
  ({ as: Tag = "div", disabled, children, ...rest }, ref) => {
    const dragProps = disabled ? {} : { "data-tauri-drag-region": "" };
    return (
      <Tag ref={ref} {...dragProps} {...rest}>
        {children}
      </Tag>
    );
  },
);
DragRegion.displayName = "DragRegion";
