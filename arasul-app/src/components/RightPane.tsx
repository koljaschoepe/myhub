import { useEffect, useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { Plus, X } from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import { useWorkspace } from "../lib/workspace";
import { useSession } from "../lib/session";
import { useAppConfig } from "../hooks/useAppConfig";
import { getXTermTheme, XTERM_FONT_FAMILY, XTERM_FONT_SIZE } from "../lib/xtermTheme";
import "./RightPane.css";

type PtyDataEvent = { data_b64: string };
type PtyExitEvent = { status: number };

type TerminalSpec = {
  /** Stable client-side id (UUID), used as React key + tab id. */
  uid: string;
  /** Project the terminal was launched in. Stays stable even when the user
      switches the active project — each terminal has its own scope. */
  projectSlug: string | null;
};

let __uidCounter = 0;
const newUid = () => `t-${Date.now().toString(36)}-${++__uidCounter}`;

/**
 * Right pane = `myhub-tui` Python REPL in a PTY.
 *
 * VS Code-style multi-terminal: top tab bar, +/× buttons, ⌘T new, ⌘W close,
 * ⌘1..9 switch. Each terminal is its own PTY+xterm pair, scoped to whatever
 * project was active when it was spawned (so terminals stay stable when the
 * user switches projects elsewhere).
 *
 * The TUI exposes slash commands (/claude, /codex, /lazygit, …). We never
 * auto-spawn an AI agent ourselves; the TUI owns that decision.
 */
export function RightPane() {
  const { state: ws } = useWorkspace();
  const { state: sessionState, driveRoot } = useSession();
  const [terminals, setTerminals] = useState<TerminalSpec[]>([]);
  const [activeUid, setActiveUid] = useState<string | null>(null);
  const initialized = useRef(false);

  // Auto-create the first terminal once we're unlocked + a project is known.
  useEffect(() => {
    if (sessionState.status !== "unlocked") return;
    if (initialized.current) return;
    initialized.current = true;
    const uid = newUid();
    setTerminals([{ uid, projectSlug: ws.projectSlug }]);
    setActiveUid(uid);
  }, [sessionState.status, ws.projectSlug]);

  const openNew = useCallback(() => {
    const uid = newUid();
    setTerminals((ts) => [...ts, { uid, projectSlug: ws.projectSlug }]);
    setActiveUid(uid);
  }, [ws.projectSlug]);

  const closeTab = useCallback((uid: string) => {
    setTerminals((ts) => {
      const next = ts.filter((t) => t.uid !== uid);
      if (activeUid === uid) {
        // Pick the neighbor that was visually next to the closed one.
        const idx = ts.findIndex((t) => t.uid === uid);
        const fallback = next[Math.max(0, idx - 1)] ?? next[0] ?? null;
        setActiveUid(fallback?.uid ?? null);
      }
      return next;
    });
  }, [activeUid]);

  // ⌘T new, ⌘W close active, ⌘1..9 switch by index.
  useEffect(() => {
    if (sessionState.status !== "unlocked") return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() === "t" && !e.shiftKey) {
        e.preventDefault();
        openNew();
      } else if (e.key.toLowerCase() === "w") {
        e.preventDefault();
        if (activeUid) closeTab(activeUid);
      } else if (/^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const idx = parseInt(e.key, 10) - 1;
        const target = terminals[idx];
        if (target) setActiveUid(target.uid);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sessionState.status, openNew, closeTab, activeUid, terminals]);

  if (sessionState.status !== "unlocked") {
    return (
      <div className="arasul-right arasul-right-placeholder">
        <p>Unlock the vault to open the terminal.</p>
      </div>
    );
  }

  return (
    <div className="arasul-right arasul-right-terminal">
      <div className="arasul-term-tabs" role="tablist">
        {terminals.map((t) => (
          <button
            key={t.uid}
            role="tab"
            aria-selected={t.uid === activeUid}
            className={"arasul-term-tab" + (t.uid === activeUid ? " active" : "")}
            onClick={() => setActiveUid(t.uid)}
            title={t.projectSlug ?? "no project"}
          >
            <span className="arasul-term-tab-label">
              myhub<span className="arasul-term-tab-sep">:</span>
              {t.projectSlug ?? "—"}
            </span>
            <span
              role="button"
              aria-label="close terminal"
              className="arasul-term-tab-close"
              onClick={(e) => { e.stopPropagation(); closeTab(t.uid); }}
            >
              <X size={11} strokeWidth={2.5} />
            </span>
          </button>
        ))}
        <button
          className="arasul-term-tab-new"
          onClick={openNew}
          title="New terminal (⌘T)"
          aria-label="New terminal"
        >
          <Plus size={13} strokeWidth={2.5} />
        </button>
      </div>
      <div className="arasul-term-stack">
        {terminals.length === 0 ? (
          <div className="arasul-term-empty">
            <span>No terminals open</span>
            <button className="arasul-term-empty-btn" onClick={openNew}>+ New terminal</button>
          </div>
        ) : (
          terminals.map((t) => (
            <div
              key={t.uid}
              className={"arasul-term-slot" + (t.uid === activeUid ? "" : " hidden")}
            >
              <MyhubTerminal
                projectSlug={t.projectSlug}
                driveRoot={driveRoot}
                visible={t.uid === activeUid}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ---------- MyhubTerminal ----------

type MyhubTerminalProps = {
  projectSlug: string | null;
  driveRoot: string;
  visible: boolean;
};

function MyhubTerminal({ projectSlug, driveRoot, visible }: MyhubTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const [status, setStatus] = useState<"idle" | "spawning" | "running" | "exited" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const termPrefs = useAppConfig().terminal;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new XTerm({
      fontFamily: XTERM_FONT_FAMILY,
      fontSize: termPrefs.font_size || XTERM_FONT_SIZE,
      theme: getXTermTheme(),
      cursorBlink: true,
      scrollback: termPrefs.scrollback || 10000,
      allowTransparency: true,
    });
    const fit = new FitAddon();
    fitRef.current = fit;
    term.loadAddon(fit);
    const search = new SearchAddon();
    searchRef.current = search;
    term.loadAddon(search);
    term.open(container);
    try { fit.fit(); } catch { /* first paint may not have laid out yet */ }

    let localPtyId: string | null = null;
    const unlistenFns: UnlistenFn[] = [];
    let disposed = false;
    setStatus("spawning");

    (async () => {
      try {
        const id = await invoke<string>("launch_myhub_tui", {
          args: {
            drive_root: driveRoot,
            project_slug: projectSlug ?? "",
            cols: term.cols,
            rows: term.rows,
          },
        });

        if (disposed) {
          void invoke("pty_kill", { id }).catch(() => {});
          return;
        }
        localPtyId = id;
        setStatus("running");

        const off1 = await listen<PtyDataEvent>(`pty://${id}/data`, (e) => {
          term.write(b64ToBytes(e.payload.data_b64));
        });
        if (disposed) { off1(); return; }
        unlistenFns.push(off1);

        const off2 = await listen<PtyExitEvent>(`pty://${id}/exit`, (e) => {
          term.write(`\r\n\x1b[33m[session ended · code ${e.payload.status} · click restart]\x1b[0m\r\n`);
          setStatus("exited");
        });
        if (disposed) { off2(); return; }
        unlistenFns.push(off2);
      } catch (err) {
        if (disposed) return;
        const msg = errorMessage(err);
        term.write(`\x1b[31m[couldn't start myhub-tui: ${msg}]\x1b[0m\r\n`);
        setStatus("error");
        setErrorMsg(msg);
      }
    })();

    const onData = term.onData((data) => {
      if (!localPtyId) return;
      void invoke("pty_write", { id: localPtyId, data }).catch((e) => {
        // P1 audit: PTY may have been killed concurrently. Surface to user.
        const msg = errorMessage(e);
        if (typeof msg === "string" && msg.includes("pty_not_found")) {
          term.write(`\r\n\x1b[31m[input dropped — terminal disconnected]\x1b[0m\r\n`);
        } else {
          console.error("pty_write failed:", e);
        }
      });
    });

    const onResize = term.onResize(({ cols, rows }) => {
      if (!localPtyId) return;
      void invoke("pty_resize", { id: localPtyId, cols, rows }).catch((e) =>
        console.error("pty_resize failed:", e)
      );
    });

    const ro = new ResizeObserver(() => {
      try { fit.fit(); } catch { /* unmount race */ }
    });
    ro.observe(container);

    return () => {
      disposed = true;
      onData.dispose();
      onResize.dispose();
      ro.disconnect();
      // Filter only callable functions — guard against listener-attach race.
      unlistenFns.filter((f): f is UnlistenFn => typeof f === "function").forEach((f) => f());
      if (localPtyId) void invoke("pty_kill", { id: localPtyId }).catch(() => {});
      term.dispose();
      fitRef.current = null;
      searchRef.current = null;
    };
  }, [projectSlug, driveRoot, nonce]);

  // Cmd+F opens search overlay if this terminal owns the focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const focused = containerRef.current?.contains(document.activeElement);
      if (!focused) return;
      if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // When the slot becomes visible after being hidden, the xterm size may
  // have drifted (window resize while hidden) — re-fit on visibility.
  useEffect(() => {
    if (!visible) return;
    const id = window.setTimeout(() => {
      try { fitRef.current?.fit(); } catch { /* ignore */ }
    }, 30);
    return () => window.clearTimeout(id);
  }, [visible]);

  const projectLabel = projectSlug ?? "no project";

  return (
    <div className="arasul-myhub-term">
      <div className="arasul-myhub-head">
        <span className="arasul-myhub-head-label">
          myhub · <span className="arasul-myhub-project">{projectLabel}</span>
        </span>
        <span className={"arasul-myhub-status arasul-myhub-status-" + status}>
          {status === "spawning" && "starting…"}
          {status === "running" && "● running"}
          {status === "exited" && "○ exited"}
          {status === "error" && "● error"}
        </span>
        {(status === "exited" || status === "error") && (
          <button
            className="arasul-myhub-restart"
            onClick={() => { setNonce((n) => n + 1); setErrorMsg(null); }}
          >Restart</button>
        )}
      </div>
      <div ref={containerRef} className="arasul-myhub-body" />
      {searchOpen && (
        <div className="arasul-term-search">
          <input
            autoFocus
            value={searchQuery}
            placeholder="Find in terminal…"
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                searchRef.current?.findNext(searchQuery, {
                  caseSensitive: false,
                  incremental: false,
                });
                if (e.shiftKey) {
                  searchRef.current?.findPrevious(searchQuery, { caseSensitive: false });
                }
              } else if (e.key === "Escape") {
                searchRef.current?.clearDecorations();
                setSearchOpen(false);
                setSearchQuery("");
              }
            }}
          />
          <button
            className="arasul-term-search-close"
            aria-label="Close search"
            onClick={() => {
              searchRef.current?.clearDecorations();
              setSearchOpen(false);
              setSearchQuery("");
            }}
          >×</button>
        </div>
      )}
      {errorMsg && status === "error" && (
        <div className="arasul-myhub-error">{errorMsg}</div>
      )}
    </div>
  );
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function errorMessage(e: unknown): string {
  if (typeof e === "object" && e && "message" in e) return String((e as { message: unknown }).message);
  if (typeof e === "object" && e && "kind" in e) return String((e as { kind: unknown }).kind);
  return String(e);
}
