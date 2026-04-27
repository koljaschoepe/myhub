import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";
import { getXTermTheme, XTERM_FONT_FAMILY, XTERM_FONT_SIZE } from "../lib/xtermTheme";

type PtyDataEvent = { data_b64: string };
type PtyExitEvent = { status: number };

export type TerminalPaneProps = {
  /** Command to spawn. Defaults to the user's shell. */
  cmd?: string;
  /** Arguments to pass to the command. */
  args?: string[];
  /** Working directory. */
  cwd?: string;
  /** Extra env vars merged on top of the inherited environment. */
  env?: Record<string, string>;
  /** Callback when the PTY exits — lets parent pane close/cycle. */
  onExit?: (status: number) => void;
  /** Called once with the backend-assigned id so parent can send SIGINT etc. */
  onPtyId?: (id: string) => void;
};

/**
 * Multi-PTY aware xterm.js host. Opens a new PTY on mount, routes events
 * through the id-namespaced channels from src-tauri/src/pty.rs (Phase 1.4).
 */
export function TerminalPane({
  cmd,
  args,
  cwd,
  env,
  onExit,
  onPtyId,
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new XTerm({
      fontFamily: XTERM_FONT_FAMILY,
      fontSize: XTERM_FONT_SIZE,
      theme: getXTermTheme(),
      cursorBlink: true,
      scrollback: 10000,
      allowTransparency: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    try { fit.fit(); } catch { /* container may not be laid out yet */ }

    let ptyId: string | null = null;
    const unlistenFns: UnlistenFn[] = [];
    let disposed = false;

    // Spawn the PTY.
    const shell = cmd ?? (import.meta.env.VITE_DEFAULT_SHELL as string | undefined) ?? "bash";
    const { cols, rows } = term;
    void (async () => {
      try {
        const id = await invoke<string>("pty_open", { cmd: shell, args, cwd, env, cols, rows });
        if (disposed) {
          void invoke("pty_kill", { id }).catch(() => {});
          return;
        }
        ptyId = id;
        onPtyId?.(id);

        const unlistenData = await listen<PtyDataEvent>(`pty://${id}/data`, (e) => {
          term.write(b64ToBytes(e.payload.data_b64));
        });
        const unlistenExit = await listen<PtyExitEvent>(`pty://${id}/exit`, (e) => {
          term.write(`\r\n\x1b[33m[process exited · code ${e.payload.status}]\x1b[0m\r\n`);
          onExit?.(e.payload.status);
        });
        unlistenFns.push(unlistenData, unlistenExit);
      } catch (err) {
        term.write(`\x1b[31m[pty_open failed: ${String(err)}]\x1b[0m\r\n`);
      }
    })();

    // Keyboard → PTY.
    const onData = term.onData((data) => {
      if (!ptyId) return;
      void invoke("pty_write", { id: ptyId, data }).catch((e) =>
        console.error("pty_write failed:", e)
      );
    });

    // xterm resize → PTY resize.
    const onResize = term.onResize(({ cols, rows }) => {
      if (!ptyId) return;
      void invoke("pty_resize", { id: ptyId, cols, rows }).catch((e) =>
        console.error("pty_resize failed:", e)
      );
    });

    // Container resize → xterm fit.
    const ro = new ResizeObserver(() => {
      try { fit.fit(); } catch { /* unmount race */ }
    });
    ro.observe(container);

    return () => {
      disposed = true;
      onData.dispose();
      onResize.dispose();
      ro.disconnect();
      if (ptyId) void invoke("pty_kill", { id: ptyId }).catch(() => {});
      unlistenFns.forEach((f) => f());
      term.dispose();
    };
  }, [cmd, args, cwd, env, onExit, onPtyId]);

  return <div ref={containerRef} className="arasul-terminal" />;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
