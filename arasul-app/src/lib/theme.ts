/**
 * Theme manager. Stores the user's preference in localStorage and applies
 * data-theme="light"/"dark" to the <html> element. "system" follows
 * prefers-color-scheme and updates live when the OS toggles.
 *
 * One source of truth: import getTheme() / setTheme() / initTheme() from
 * here, never poke document.documentElement.dataset.theme directly.
 */

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
