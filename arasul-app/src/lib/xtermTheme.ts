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

/**
 * Phase 9.10 (2026-05-11) — 256-color audit.
 *
 * myhub-tui's palette (myhub_tui/core/theme.py) uses these ANSI names:
 *   PRIMARY  = "cyan"     SUCCESS = "green"
 *   WARNING  = "yellow"   ERROR   = "red"
 *   DIM      = "dim"
 *
 * Plus a 7-step truecolor logo gradient `#00d4ff → #5870ff` via Rich's
 * styled console. Truecolor (`\x1b[38;2;R;G;B`) renders natively in
 * xterm.js without needing an entry in the theme object.
 *
 * Below covers every ANSI name the TUI uses today, plus the bright-*
 * variants xterm falls back to when the TUI emits SGR 90-97 sequences
 * (which happens when Rich auto-promotes "bright" styles). The Cursor /
 * Linear-inspired cyan accent stays the lone non-token color.
 */
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
    brightGreen: cssVar("--success-hover", "#4FB675"),
    red: cssVar("--danger", "#E55C5C"),
    brightRed: cssVar("--danger-hover", "#D14444"),
    yellow: cssVar("--warning", "#E6A23C"),
    brightYellow: "#F0B95C",
    cyan: "#46c8d3",
    brightCyan: "#7be3ed",
    magenta: "#c678dd",
    brightMagenta: "#d894e8",
  };
}

export const XTERM_FONT_FAMILY =
  '"Geist Mono", "SF Mono", "JetBrains Mono", Menlo, monospace';
export const XTERM_FONT_SIZE = 13;
