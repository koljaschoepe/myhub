/**
 * Phase 7.3 (2026-05-11) — recent-commands MRU for the command palette.
 *
 * Tracks command IDs the user has selected, so the palette can surface
 * a "Recent" group at the top. Caps at 5 entries (small bar for what's
 * useful in a single keystroke-glance). Newest first; selecting a
 * command that's already present moves it to the front.
 *
 * Distinct from `recentFiles.ts` — that one tracks files opened via
 * the editor; this one tracks *commands run* (Settings, Lock drive,
 * Refresh wiki, etc.). Files have their own MRU because the palette
 * surfaces them in a different mode anyway.
 */

const KEY = "arasul.recentCommands";
const MAX = 5;

function read(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function write(list: string[]) {
  try { window.localStorage.setItem(KEY, JSON.stringify(list)); }
  catch { /* quota / private mode */ }
}

export function pushRecentCommand(id: string) {
  if (!id) return;
  const cur = read();
  const next = [id, ...cur.filter((c) => c !== id)].slice(0, MAX);
  write(next);
}

export function getRecentCommands(): string[] {
  return read();
}
