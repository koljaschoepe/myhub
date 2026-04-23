"""/git — minimal pull / push / log / status for the active project.

Simpler than OpenAra's commands/git_ops.py: no gh-CLI setup wizard, no
SSH-key upload — myhub assumes git is already set up on the host the
user plugs into.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

from myhub_tui.core.state import TuiState
from myhub_tui.core.theme import DIM, SUCCESS, WARNING
from myhub_tui.core.types import CommandResult


GIT_TIMEOUT_SECONDS = 30
LOG_TIMEOUT_SECONDS = 10


def _ensure_git_repo(project_root: Path) -> str | None:
    """Return None if ok, else an error message."""
    if not project_root.exists():
        return f"Projekt-Verzeichnis existiert nicht: {project_root}"
    if not (project_root / ".git").exists():
        return f"Kein Git-Repo: {project_root}"
    return None


def _run_git(project_root: Path, args: list[str], timeout: int) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", "-C", str(project_root), *args],
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def cmd_git(state: TuiState, args: list[str]) -> CommandResult:
    if not state.active_project or not state.project_root:
        return CommandResult(
            ok=False,
            lines=["Kein aktives Projekt. Erst /open <name>."],
            style="error",
        )

    err = _ensure_git_repo(state.project_root)
    if err:
        return CommandResult(ok=False, lines=[err], style="error")

    sub = args[0].lower() if args else "status"

    if sub == "pull":
        return _cmd_pull(state.project_root)
    if sub == "push":
        return _cmd_push(state.project_root)
    if sub == "log":
        return _cmd_log(state.project_root, args[1:])
    if sub == "status":
        return _cmd_status(state.project_root)

    return CommandResult(
        ok=False,
        lines=[f"Unbekanntes /git-Subcommand: {sub}. Erlaubt: pull, push, log, status."],
        style="error",
    )


def _cmd_pull(project_root: Path) -> CommandResult:
    try:
        proc = _run_git(project_root, ["pull"], GIT_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        return CommandResult(ok=False, lines=["git pull: Timeout."], style="error")

    output = proc.stdout + proc.stderr

    if "CONFLICT" in output or "Automatic merge failed" in output:
        return CommandResult(
            ok=False,
            lines=[
                "Merge-Konflikt. Manuell auflösen:",
                "  git status              — konflikte sehen",
                "  git merge --abort       — merge zurückdrehen",
                "",
                f"[{DIM}]{output.strip()[:400]}[/{DIM}]",
            ],
            style="error",
        )
    if proc.returncode != 0:
        return CommandResult(
            ok=False, lines=[output.strip()[:400] or "git pull fehlgeschlagen."],
            style="error",
        )
    if "Already up to date" in output:
        return CommandResult(
            ok=True, lines=[f"[{SUCCESS}]✓[/{SUCCESS}] Schon aktuell."],
        )
    return CommandResult(
        ok=True,
        lines=[
            f"[{SUCCESS}]✓[/{SUCCESS}] Gezogen.",
            f"[{DIM}]{output.strip()[:400]}[/{DIM}]",
        ],
    )


def _cmd_push(project_root: Path) -> CommandResult:
    try:
        proc = _run_git(project_root, ["push"], GIT_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        return CommandResult(ok=False, lines=["git push: Timeout."], style="error")

    output = proc.stdout + proc.stderr
    if proc.returncode != 0:
        return CommandResult(
            ok=False,
            lines=[output.strip()[:400] or "git push fehlgeschlagen."],
            style="error",
        )
    return CommandResult(
        ok=True,
        lines=[
            f"[{SUCCESS}]✓[/{SUCCESS}] Gepusht.",
            f"[{DIM}]{output.strip()[:400]}[/{DIM}]" if output.strip() else "",
        ],
    )


def _cmd_log(project_root: Path, rest: list[str]) -> CommandResult:
    limit = "10"
    if rest and rest[0].isdigit():
        limit = rest[0]
    try:
        proc = _run_git(
            project_root,
            ["log", f"-n{limit}", "--pretty=format:%h  %ar  %s"],
            LOG_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        return CommandResult(ok=False, lines=["git log: Timeout."], style="error")

    if proc.returncode != 0:
        return CommandResult(
            ok=False,
            lines=[proc.stderr.strip() or "git log fehlgeschlagen."],
            style="error",
        )
    lines = proc.stdout.splitlines() or [f"[{DIM}]Keine Commits.[/{DIM}]"]
    return CommandResult(ok=True, lines=lines)


def _cmd_status(project_root: Path) -> CommandResult:
    try:
        branch = _run_git(project_root, ["branch", "--show-current"], 5)
        short = _run_git(project_root, ["status", "--short"], 5)
    except subprocess.TimeoutExpired:
        return CommandResult(ok=False, lines=["git status: Timeout."], style="error")

    branch_name = branch.stdout.strip() or "(detached)"
    dirty = short.stdout.strip()
    lines = [f"[bold]Branch:[/bold] {branch_name}"]
    if not dirty:
        lines.append(f"[{SUCCESS}]clean[/{SUCCESS}]")
    else:
        lines.append(f"[{WARNING}]dirty[/{WARNING}]")
        for entry in dirty.splitlines()[:20]:
            lines.append(f"  [{DIM}]{entry}[/{DIM}]")
        extra = len(dirty.splitlines()) - 20
        if extra > 0:
            lines.append(f"  [{DIM}](+{extra} weitere)[/{DIM}]")
    return CommandResult(ok=True, lines=lines)
