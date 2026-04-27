/**
 * Recent-files MRU list, persisted in localStorage.
 *
 * We keep at most 8 entries — enough to be useful in the palette
 * without crowding the visible group. Newest first; pushing a path
 * that's already in the list moves it to the front.
 */

const KEY = "arasul.recentFiles";
const MAX = 8;

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

export function pushRecent(path: string) {
  if (!path) return;
  const cur = read();
  const next = [path, ...cur.filter((p) => p !== path)].slice(0, MAX);
  write(next);
}

export function getRecent(): string[] {
  return read();
}

export function clearRecent() {
  write([]);
}
