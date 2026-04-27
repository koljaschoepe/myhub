/**
 * UI density — Compact / Normal / Spacious. Mirrors the theme manager's
 * pattern: stored in localStorage, applied via `data-density` on <html>.
 *
 * CSS hooks the density via the data-density selector and adjusts spacing
 * tokens. theme.css owns the actual scale variables; this file only owns
 * the persistence + apply mechanism.
 */

export type DensityChoice = "compact" | "normal" | "spacious";

const STORAGE_KEY = "arasul.density";

function read(): DensityChoice {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "compact" || v === "normal" || v === "spacious") return v;
  } catch { /* ignore */ }
  return "normal";
}

function apply(choice: DensityChoice) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.density = choice;
}

export function getDensity(): DensityChoice {
  return read();
}

export function setDensity(choice: DensityChoice) {
  try { window.localStorage.setItem(STORAGE_KEY, choice); } catch { /* ignore */ }
  apply(choice);
}

/** Run once on app start. Idempotent. Apply persisted density to <html>. */
export function initDensity() {
  apply(read());
}
