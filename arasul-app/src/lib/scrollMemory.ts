/**
 * Phase 6.14 (2026-05-11) — per-file scroll-position memory.
 *
 * Saves scrollTop in localStorage keyed by absolute file path. The map
 * is capped at 50 entries; the oldest entry is evicted on overflow to
 * keep the bucket bounded (localStorage quotas are tiny and we don't
 * want one wild file to push everything out).
 *
 * Used by the markdown editor (and any other tab-mounted viewer that
 * wants to behave: re-opening a file restores the scroll position
 * the user left it at).
 *
 * The API is sync because every consumer is on the React render path.
 */

const KEY = "arasul.scrollMemory.v1";
const MAX = 50;

type Entry = { path: string; top: number; ts: number };

function read(): Entry[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (e): e is Entry =>
        typeof e === "object" &&
        e !== null &&
        typeof e.path === "string" &&
        typeof e.top === "number" &&
        typeof e.ts === "number",
    );
  } catch {
    return [];
  }
}

function write(list: Entry[]) {
  try { window.localStorage.setItem(KEY, JSON.stringify(list)); }
  catch { /* quota / private mode — best-effort */ }
}

export function getScroll(path: string): number | null {
  if (!path) return null;
  const hit = read().find((e) => e.path === path);
  return hit ? hit.top : null;
}

export function saveScroll(path: string, top: number) {
  if (!path) return;
  // Don't bother persisting "top of file" — it's the default and just
  // fills the bucket.
  if (top <= 0) return;
  const now = Date.now();
  const cur = read().filter((e) => e.path !== path);
  cur.unshift({ path, top, ts: now });
  if (cur.length > MAX) cur.length = MAX;
  write(cur);
}
