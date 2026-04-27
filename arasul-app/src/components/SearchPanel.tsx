import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Search, X } from "lucide-react";
import { useWorkspace } from "../lib/workspace";
import { useSession } from "../lib/session";
import { useFocusTrap } from "../lib/useFocusTrap";
import "./SearchPanel.css";

type SearchHit = { path: string; line: number; col: number; text: string };

type Props = { open: boolean; onClose: () => void };

/**
 * VS Code-style search-across-files panel. Modal overlay keyed off ⌘⇧F.
 * Backed by `rg` (ripgrep) when present, with a slow fallback baked into
 * the Rust command. Click a hit → openFile(path); the editor mounts the
 * file at the active tab.
 */
export function SearchPanel({ open, onClose }: Props) {
  const { state: ws, openFile } = useWorkspace();
  const { driveRoot } = useSession();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => { if (open) { inputRef.current?.focus(); inputRef.current?.select(); } }, [open]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!query.trim() || !ws.projectSlug) {
      setHits([]); setError(null); return;
    }
    const root = `${driveRoot}/content/projects/${ws.projectSlug}`;
    debounceRef.current = window.setTimeout(async () => {
      setBusy(true); setError(null);
      try {
        const result = await invoke<SearchHit[]>("search_in_project", {
          args: { root, query: query.trim(), case_sensitive: caseSensitive },
        });
        setHits(result);
      } catch (e) {
        setError(typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e));
      } finally {
        setBusy(false);
      }
    }, 200);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [open, query, caseSensitive, ws.projectSlug, driveRoot]);

  if (!open) return null;

  // Group by file.
  const grouped = new Map<string, SearchHit[]>();
  for (const h of hits) {
    const arr = grouped.get(h.path) ?? [];
    arr.push(h);
    grouped.set(h.path, arr);
  }

  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  return (
    <div className="arasul-search-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="arasul-search-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Search across files"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="arasul-search-head">
          <Search size={14} />
          <input
            ref={inputRef}
            className="arasul-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={ws.projectSlug ? `Search in ${ws.projectSlug}…` : "Pick a project first"}
            disabled={!ws.projectSlug}
            onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
          />
          <button
            className={"arasul-search-tog" + (caseSensitive ? " active" : "")}
            onClick={() => setCaseSensitive((c) => !c)}
            title="Case sensitive"
          >Aa</button>
          <button className="arasul-search-close" onClick={onClose} aria-label="Close search">
            <X size={14} />
          </button>
        </div>
        <div className="arasul-search-meta">
          {busy && <span>Searching…</span>}
          {!busy && hits.length > 0 && <span>{hits.length} match{hits.length === 1 ? "" : "es"} in {grouped.size} file{grouped.size === 1 ? "" : "s"}</span>}
          {!busy && !error && query.trim() && hits.length === 0 && <span>No matches.</span>}
          {error && <span className="arasul-error">{error}</span>}
        </div>
        <div className="arasul-search-results">
          {Array.from(grouped.entries()).map(([path, items]) => {
            const name = path.split("/").pop() ?? path;
            const rel = path.split("projects/")[1] ?? path;
            return (
              <div key={path} className="arasul-search-group">
                <div className="arasul-search-file">
                  <span className="arasul-search-file-name">{name}</span>
                  <span className="arasul-search-file-dir">{rel.replace(/\/?[^/]+$/, "")}</span>
                  <span className="arasul-search-file-count">{items.length}</span>
                </div>
                {items.map((hit, i) => (
                  <button
                    key={i}
                    className="arasul-search-hit"
                    onClick={() => { openFile(path); onClose(); }}
                  >
                    <span className="arasul-search-hit-line">{hit.line}</span>
                    <span className="arasul-search-hit-text">{hit.text}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
