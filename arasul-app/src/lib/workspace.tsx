import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSession } from "./session";

/**
 * Workspace state — current project + ordered list of open files
 * (VS Code/Cursor-style tabs). The active file is the one currently shown.
 *
 * Persisted to `memory/config.toml` under `workspace.last_project` —
 * tabs themselves are session-scoped and not persisted (resetting them
 * on relaunch keeps the workspace tidy).
 */
export type WorkspaceState = {
  projectSlug: string | null;
  openFiles: string[];
  openFilePath: string | null; // == active file, kept name for backwards compat
};

type WorkspaceContextValue = {
  state: WorkspaceState;
  openFile: (path: string | null) => void;
  closeFile: (path: string) => void;
  setProject: (slug: string | null) => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { state: sessionState, driveRoot } = useSession();
  const [state, setState] = useState<WorkspaceState>({
    projectSlug: null,
    openFiles: [],
    openFilePath: null,
  });

  useEffect(() => {
    if (sessionState.status !== "unlocked") return;
    void invoke<{ workspace?: { last_project?: string } }>("get_config", { driveRoot })
      .then((cfg) => {
        const last = cfg.workspace?.last_project;
        if (last) setState((s) => ({ ...s, projectSlug: last }));
      })
      .catch((e) => console.warn("workspace.get_config failed:", e));
  }, [sessionState.status, driveRoot]);

  const openFile = useCallback((path: string | null) => {
    setState((s) => {
      if (path === null) return { ...s, openFilePath: null };
      const exists = s.openFiles.includes(path);
      return {
        ...s,
        openFiles: exists ? s.openFiles : [...s.openFiles, path],
        openFilePath: path,
      };
    });
  }, []);

  const closeFile = useCallback((path: string) => {
    setState((s) => {
      const idx = s.openFiles.indexOf(path);
      if (idx === -1) return s;
      const next = s.openFiles.filter((p) => p !== path);
      let active = s.openFilePath;
      if (active === path) {
        // Pick neighbor: prefer the one to the right; fall back to left; null if last.
        active = next[idx] ?? next[idx - 1] ?? null;
      }
      return { ...s, openFiles: next, openFilePath: active };
    });
  }, []);

  const setProject = useCallback((slug: string | null) => {
    setState((s) => ({ ...s, projectSlug: slug, openFiles: [], openFilePath: null }));
    if (sessionState.status === "unlocked") {
      void invoke("set_config", {
        driveRoot,
        patch: { workspace: { last_project: slug ?? null } },
      }).catch((e) => console.warn("workspace.set_config failed:", e));
    }
  }, [sessionState.status, driveRoot]);

  return (
    <WorkspaceContext.Provider value={{ state, openFile, closeFile, setProject }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return ctx;
}
