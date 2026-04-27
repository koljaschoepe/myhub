import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type GithubStatus = {
  is_repo: boolean;
  has_origin: boolean;
  branch: string | null;
  ahead: number;
  behind: number;
  dirty: number;
};

const EMPTY: GithubStatus = {
  is_repo: false,
  has_origin: false,
  branch: null,
  ahead: 0,
  behind: 0,
  dirty: 0,
};

/**
 * Polls `github_project_status` for the active project. Refreshes on
 * project change, on a 8s interval, and on demand via the returned
 * `refresh` callback (call after a push/commit/pull).
 *
 * Returns null while the first fetch is in flight so the UI can hide
 * git controls cleanly until status is known.
 */
export function useGithubStatus(driveRoot: string, slug: string | null): {
  status: GithubStatus | null;
  refresh: () => void;
} {
  const [status, setStatus] = useState<GithubStatus | null>(slug ? null : EMPTY);

  const refresh = useCallback(() => {
    if (!slug) { setStatus(EMPTY); return; }
    void invoke<GithubStatus>("github_project_status", {
      args: { drive_root: driveRoot, slug },
    })
      .then(setStatus)
      .catch(() => setStatus(EMPTY));
  }, [driveRoot, slug]);

  useEffect(() => {
    refresh();
    if (!slug) return;
    const id = window.setInterval(refresh, 8000);
    return () => window.clearInterval(id);
  }, [slug, refresh]);

  return { status, refresh };
}
