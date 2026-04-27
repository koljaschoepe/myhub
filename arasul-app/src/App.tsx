import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { SessionProvider, useSession } from "./lib/session";
import { WorkspaceProvider } from "./lib/workspace";
import { TopBar } from "./components/TopBar";
import { StatusBar } from "./components/StatusBar";
import { ThreePaneShell } from "./components/ThreePaneShell";
import { Unlock } from "./screens/Unlock";
import { Onboarding } from "./screens/Onboarding";
import { Settings } from "./screens/Settings";
import { CommandPalette } from "./components/CommandPalette";
import { SearchPanel } from "./components/SearchPanel";
import { ShortcutsOverlay } from "./components/ShortcutsOverlay";
import { useWorkspace } from "./lib/workspace";
import { pushRecent } from "./lib/recentFiles";
import { notify } from "./lib/toast";
import "./App.css";

function App() {
  const [driveRoot, setDriveRoot] = useState<string | null>(null);
  const [driveError, setDriveError] = useState<string | null>(null);

  // Resolve the drive root once at mount. Production: /Volumes/myhub.
  // Dev: $ARASUL_ROOT or repo root. If nothing matches, surface a friendly
  // "plug in your drive" screen.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const root = await invoke<string>("detect_drive_root");
        if (!cancelled) setDriveRoot(root);
      } catch (e) {
        if (cancelled) return;
        const fallback = (import.meta.env.VITE_ARASUL_ROOT as string | undefined) ?? null;
        if (fallback) {
          setDriveRoot(fallback);
        } else {
          setDriveError(typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e));
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (driveError) {
    return (
      <div className="arasul-screen-host">
        <div className="arasul-screen arasul-splash">
          <div className="arasul-splash-mark">Arasul</div>
          <div className="arasul-splash-error">
            <p>Couldn't find your Arasul drive.</p>
            <p className="arasul-muted">Plug in the drive labeled <code>myhub</code> and reopen the app.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!driveRoot) {
    return (
      <div className="arasul-screen-host">
        <div className="arasul-screen arasul-splash">
          <div className="arasul-splash-mark">Arasul</div>
        </div>
      </div>
    );
  }

  return (
    <SessionProvider driveRoot={driveRoot}>
      <WorkspaceProvider>
        <AppShell />
      </WorkspaceProvider>
    </SessionProvider>
  );
}

function AppShell() {
  const { state, lock, driveRoot } = useSession();
  const { state: ws } = useWorkspace();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [focusMode, setFocusMode] = useState<boolean>(() => {
    try { return window.localStorage.getItem("arasul.focusMode") === "1"; }
    catch { return false; }
  });
  const [ejected, setEjected] = useState<string | null>(null);

  // A5 — react to drive eject events from the DriveWatcher. Lock the
  // vault and show a modal; when the drive comes back (drive://mounted
  // for the same path) we dismiss and the session state re-resolves.
  useEffect(() => {
    let unlistenEject: (() => void) | null = null;
    let unlistenMount: (() => void) | null = null;
    (async () => {
      unlistenEject = await listen<{ mount_point: string }>("drive://ejected", (e) => {
        if (e.payload.mount_point === driveRoot) {
          setEjected(e.payload.mount_point);
          void lock().catch((err) => notify.err("Couldn't lock the vault on eject", err));
        }
      });
      unlistenMount = await listen<{ mount_point: string }>("drive://mounted", (e) => {
        if (e.payload.mount_point === driveRoot) setEjected(null);
      });
    })();
    return () => {
      unlistenEject?.();
      unlistenMount?.();
    };
  }, [driveRoot, lock]);

  // Track every file open into the recent-files MRU. Catches every open
  // path (palette, tree, search hit, drag-drop), since they all converge
  // on `workspace.openFilePath`.
  useEffect(() => {
    if (ws.openFilePath) pushRecent(ws.openFilePath);
  }, [ws.openFilePath]);

  // Global shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === ",") {
        e.preventDefault();
        setSettingsOpen((s) => !s);
        setPaletteOpen(false);
        setSearchOpen(false);
      } else if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((p) => !p);
        setSettingsOpen(false);
        setSearchOpen(false);
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearchOpen((s) => !s);
        setSettingsOpen(false);
        setPaletteOpen(false);
      } else if (mod && e.key === "/") {
        e.preventDefault();
        setShortcutsOpen((s) => !s);
        setSettingsOpen(false);
        setPaletteOpen(false);
        setSearchOpen(false);
      } else if (mod && e.key === ";") {
        e.preventDefault();
        setFocusMode((cur) => {
          const next = !cur;
          try { window.localStorage.setItem("arasul.focusMode", next ? "1" : "0"); } catch { /* ignore */ }
          return next;
        });
      } else if (mod && e.key.toLowerCase() === "l") {
        // ⌘L — lock vault. Was advertised in ShortcutsOverlay as "(coming)";
        // wired now. Closes any open overlays so the Unlock screen is the
        // only thing visible after.
        e.preventDefault();
        setSettingsOpen(false);
        setPaletteOpen(false);
        setSearchOpen(false);
        setShortcutsOpen(false);
        void lock().catch((err) => notify.err("Couldn't lock the vault", err));
      } else if (e.key === "Escape") {
        setSettingsOpen(false);
        setPaletteOpen(false);
        setSearchOpen(false);
        setShortcutsOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lock]);

  const screen = (() => {
    if (state.status === "checking") {
      return (
        <div key="splash" className="arasul-screen arasul-splash">
          <div className="arasul-splash-mark">Arasul</div>
        </div>
      );
    }
    if (state.status === "absent") {
      return <div key="onboarding" className="arasul-screen"><Onboarding /></div>;
    }
    if (state.status === "locked") {
      return <div key="unlock" className="arasul-screen"><Unlock /></div>;
    }
    return (
      <div key="main" className={"arasul-screen arasul-app" + (focusMode ? " focus" : "")}>
        <TopBar onOpenSettings={() => setSettingsOpen(true)} />
        <ThreePaneShell />
        <StatusBar />
        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          onOpenSettings={() => { setSettingsOpen(true); setPaletteOpen(false); }}
          onOpenSearch={() => { setSearchOpen(true); setPaletteOpen(false); }}
        />
        <SearchPanel open={searchOpen} onClose={() => setSearchOpen(false)} />
        {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
        {shortcutsOpen && <ShortcutsOverlay onClose={() => setShortcutsOpen(false)} />}
        {ejected && <DriveEjectedModal mountPoint={ejected} />}
      </div>
    );
  })();

  return <div className="arasul-screen-host">{screen}</div>;
}

function DriveEjectedModal({ mountPoint }: { mountPoint: string }) {
  return (
    <div className="arasul-eject-overlay">
      <div
        className="arasul-eject-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="eject-title"
      >
        <h2 id="eject-title">Your drive disconnected.</h2>
        <p>
          Plug <code>{mountPoint}</code> back in when you're ready — your last edit is saved.
        </p>
        <p className="arasul-eject-hint">
          Arasul locked the vault automatically. You'll unlock it again on reconnect.
        </p>
      </div>
    </div>
  );
}

export default App;
