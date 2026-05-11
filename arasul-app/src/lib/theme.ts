/**
 * Theme manager. Stores the user's preference in localStorage and applies
 * data-theme="light"/"dark" to the <html> element. "system" follows
 * prefers-color-scheme and updates live when the OS toggles.
 *
 * One source of truth: import getTheme() / setTheme() / initTheme() from
 * here, never poke document.documentElement.dataset.theme directly.
 *
 * Phase 9.1 (2026-05-11): also writes a small JSON snapshot to
 * <driveRoot>/.boot/.current-theme.json whenever the theme switches.
 * myhub-tui reads this file at startup so its Rich palette tracks
 * Arasul's theme without needing a daemon or IPC channel. SIGUSR1 hot-
 * swap is a follow-up — for now the user just reopens the right pane
 * to pick up the new palette.
 */

import { invoke } from "@tauri-apps/api/core";

export type ThemeChoice = "system" | "light" | "dark";

const STORAGE_KEY = "arasul.theme";
const MEDIA = "(prefers-color-scheme: light)";

let mqlListenerAttached = false;

function readChoice(): ThemeChoice {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch { /* ignore */ }
  return "system";
}

function effective(choice: ThemeChoice): "light" | "dark" {
  if (choice === "light" || choice === "dark") return choice;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia(MEDIA).matches ? "light" : "dark";
}

function apply(theme: "light" | "dark") {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
}

/** Run once on app start. Idempotent. */
export function initTheme() {
  const choice = readChoice();
  apply(effective(choice));

  if (mqlListenerAttached) return;
  mqlListenerAttached = true;
  if (typeof window === "undefined") return;
  const mql = window.matchMedia(MEDIA);
  const onChange = () => {
    if (readChoice() === "system") apply(effective("system"));
  };
  // Safari < 14 used addListener; modern is addEventListener.
  if ("addEventListener" in mql) mql.addEventListener("change", onChange);
  else (mql as unknown as { addListener: (cb: () => void) => void }).addListener(onChange);
}

export function getTheme(): ThemeChoice {
  return readChoice();
}

export function setTheme(choice: ThemeChoice) {
  try { window.localStorage.setItem(STORAGE_KEY, choice); } catch { /* ignore */ }
  apply(effective(choice));
}

/**
 * Phase 9.1: snapshot the current theme's key CSS-var values into a
 * small JSON file at $driveRoot/.boot/.current-theme.json. myhub-tui
 * reads this file on startup; future Phase 9.x will SIGUSR1 the TUI
 * to hot-swap.
 *
 * The snapshot includes only the tokens the TUI actually consumes
 * (Rich-style names: PRIMARY, SUCCESS, WARNING, ERROR, DIM) so the file
 * stays small (< 1KB) and the read is trivial on the Python side.
 *
 * Cheap to call — invokes a single write_file Tauri command. Safe to
 * call on every setTheme(); the file's atomic-rename pattern keeps
 * readers from seeing a half-written state.
 */
export async function writeThemeBridge(driveRoot: string): Promise<void> {
  if (!driveRoot) return;
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  const snapshot = {
    schema: 1,
    written_at: Date.now(),
    effective: document.documentElement.dataset.theme === "light" ? "light" : "dark",
    tokens: {
      // Surfaces
      bg_canvas:    v("--bg-canvas"),
      bg_surface:   v("--bg-pane"),
      bg_elevated:  v("--bg-elevated"),
      // Foreground
      text_primary:   v("--text-primary"),
      text_secondary: v("--text-secondary"),
      text_tertiary:  v("--text-tertiary"),
      // Accent + status
      accent:  v("--accent"),
      success: v("--success"),
      warning: v("--warning"),
      danger:  v("--danger"),
      info:    v("--info"),
    },
    // Rich-style aliases the TUI consumes directly. Same hex values
    // as above, just renamed for one-shot consumption.
    rich: {
      PRIMARY: v("--accent"),
      SUCCESS: v("--success"),
      WARNING: v("--warning"),
      ERROR:   v("--danger"),
      DIM:     v("--text-tertiary"),
    },
  };
  const path = `${driveRoot}/.boot/.current-theme.json`;
  try {
    await invoke("write_file", { path, content: JSON.stringify(snapshot, null, 2) });
  } catch (e) {
    console.warn("writeThemeBridge: couldn't write theme snapshot:", e);
  }
}
