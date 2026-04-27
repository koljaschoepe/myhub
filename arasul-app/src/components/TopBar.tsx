import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ArrowUpRight, GitBranch, Upload, Check, AlertCircle, Settings as SettingsIcon } from "lucide-react";
import { useSession } from "../lib/session";
import { useWorkspace } from "../lib/workspace";
import { useGithubStatus } from "../hooks/useGithubStatus";
import { notify } from "../lib/toast";
import "./TopBar.css";

type UpdateInfo = {
  current_version: string;
  latest_version: string;
  update_available: boolean;
};

type PushResult = {
  stdout: string;
  stderr: string;
  committed: boolean;
};

type Props = {
  onOpenSettings?: () => void;
};

/**
 * Top bar — brand · briefer · git status pill · push button · update pill.
 *
 * Push behavior (locked decision 2026-04-26):
 *   One-click. Stages all changes, commits with "Update from Arasul · {ts}",
 *   pushes. On success, a Sonner toast offers a 5-second Undo that runs
 *   `git revert HEAD --no-edit && git push` — never destructive.
 *
 * Git controls hide cleanly when:
 *   - no project active
 *   - the project is not a git repo
 *   - no remote origin
 *   - no GitHub token saved (offer route to Settings)
 */
export function TopBar({ onOpenSettings }: Props = {}) {
  const { state, driveRoot } = useSession();
  const { state: ws } = useWorkspace();
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [pushing, setPushing] = useState(false);

  const handle = state.status === "unlocked" ? state.handle : null;
  const slug = ws.projectSlug ?? null;
  const { status: gh, refresh: refreshGh } = useGithubStatus(driveRoot, slug);

  useEffect(() => {
    if (state.status !== "unlocked") return;
    void invoke<UpdateInfo>("check_for_update")
      .then((info) => { if (info.update_available) setUpdate(info); })
      .catch(() => { /* offline / API down — silent */ });
  }, [state.status]);

  const onPush = useCallback(async () => {
    if (!handle || !slug || pushing) return;
    setPushing(true);
    const ts = new Date().toISOString().replace("T", " ").slice(0, 16);
    const message = `Update from Arasul · ${ts}`;
    try {
      const result = await invoke<PushResult>("github_push", {
        args: { handle, drive_root: driveRoot, slug, commit_message: message },
      });
      refreshGh();
      // Only offer Undo when we actually created a new commit. If the push
      // was a no-op (nothing to commit, just up-to-date), Undo would have
      // nothing to revert and would error on the user.
      if (result.committed) {
        notify.info("Pushed to GitHub", {
          duration: 5000,
          action: {
            label: "Undo",
            onClick: () => void onUndo(),
          },
        });
      } else {
        notify.ok("Already up to date");
      }
    } catch (e) {
      notify.err("Couldn't push", e);
    } finally {
      setPushing(false);
    }
    // onUndo is defined below; declared inline so the toast captures the
    // right closure each push.
    async function onUndo() {
      try {
        await invoke("github_undo_last_push", {
          args: { handle, drive_root: driveRoot, slug },
        });
        refreshGh();
        notify.ok("Push undone");
      } catch (err) {
        notify.err("Couldn't undo the push", err);
      }
    }
  }, [handle, slug, driveRoot, pushing, refreshGh]);

  const briefer = state.status === "unlocked"
    ? slug
      ? `${slug} · ${ws.openFilePath ? ws.openFilePath.split("/").pop() : "no file open"}`
      : ws.openFilePath
        ? `${ws.openFilePath.split("/").pop()}`
        : "ready — pick a file or press ⌘P for projects"
    : state.status === "locked" ? "vault locked"
    : state.status === "absent" ? "onboarding"
    : "";

  // Git controls only shown for an unlocked, project-scoped, repo-with-origin.
  const showGitControls =
    state.status === "unlocked" &&
    !!slug &&
    !!gh?.is_repo &&
    gh.has_origin;

  return (
    <header className="arasul-topbar">
      <span className="arasul-brand">Arasul</span>
      <button
        type="button"
        className="arasul-topbar-iconbtn"
        onClick={onOpenSettings}
        title="Settings (⌘,)"
        aria-label="Open settings"
      >
        <SettingsIcon size={14} />
      </button>
      <span className="arasul-briefer">{briefer}</span>

      {showGitControls && gh && (
        <>
          <GitStatusPill status={gh} />
          {gh.branch && (
            <span className="arasul-git-branch" title="Current branch">
              <GitBranch size={11} />
              {gh.branch}
            </span>
          )}
          <button
            type="button"
            className={"arasul-push-btn" + (pushing ? " pushing" : "")}
            onClick={() => void onPush()}
            disabled={pushing}
            title={pushing ? "Pushing…" : "Save & push to GitHub"}
            aria-label="Push to GitHub"
          >
            <Upload size={12} />
            <span>{pushing ? "Pushing…" : "Push"}</span>
          </button>
        </>
      )}

      {update && (
        <button
          className="arasul-update-pill"
          onClick={onOpenSettings}
          title={`Update available — ${update.latest_version}`}
        >
          <span>Update</span>
          <ArrowUpRight size={12} />
        </button>
      )}
    </header>
  );
}

function GitStatusPill({ status }: { status: { dirty: number; ahead: number; behind: number } }) {
  const { dirty, ahead, behind } = status;
  if (dirty === 0 && ahead === 0 && behind === 0) {
    return (
      <span className="arasul-git-pill arasul-git-pill-clean" title="Working tree clean, up to date with origin">
        <Check size={11} />
        <span>clean</span>
      </span>
    );
  }
  const parts: string[] = [];
  if (dirty > 0) parts.push(`${dirty} ${dirty === 1 ? "change" : "changes"}`);
  if (ahead > 0) parts.push(`↑${ahead}`);
  if (behind > 0) parts.push(`↓${behind}`);
  const cls = behind > 0 ? "arasul-git-pill arasul-git-pill-behind"
    : dirty > 0 ? "arasul-git-pill arasul-git-pill-dirty"
    : "arasul-git-pill arasul-git-pill-ahead";
  return (
    <span className={cls} title={`${dirty} unsynced changes · ${ahead} ahead · ${behind} behind`}>
      {behind > 0 ? <AlertCircle size={11} /> : null}
      <span>{parts.join(" · ")}</span>
    </span>
  );
}
