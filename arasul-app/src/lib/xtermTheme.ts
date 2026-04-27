/**
 * Single source of truth for xterm.js color/font config.
 * Reads CSS custom properties from :root so palettes stay in sync with theme.css.
 * Re-call after a theme change to rebuild.
 */
import type { ITheme } from "@xterm/xterm";

const cssVar = (name: string, fallback: string): string => {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};

export function getXTermTheme(): ITheme {
  return {
    background: cssVar("--bg-canvas", "#0E0F11"),
    foreground: cssVar("--text-primary", "#E6E8EC"),
    cursor: cssVar("--accent", "#7C8FFC"),
    cursorAccent: cssVar("--bg-canvas", "#0E0F11"),
    selectionBackground: cssVar("--accent-soft", "rgba(124,143,252,0.13)"),
    black: cssVar("--bg-canvas", "#0E0F11"),
    brightBlack: cssVar("--text-tertiary", "#636976"),
    white: cssVar("--text-primary", "#E6E8EC"),
    brightWhite: "#FFFFFF",
    blue: cssVar("--accent", "#7C8FFC"),
    brightBlue: cssVar("--accent-strong", "#6578E8"),
    green: cssVar("--success", "#62C98A"),
    red: cssVar("--danger", "#E55C5C"),
    yellow: cssVar("--warning", "#E6A23C"),
    cyan: "#46c8d3",
    brightCyan: "#7be3ed",
  };
}

export const XTERM_FONT_FAMILY =
  '"Geist Mono", "SF Mono", "JetBrains Mono", Menlo, monospace';
export const XTERM_FONT_SIZE = 13;
