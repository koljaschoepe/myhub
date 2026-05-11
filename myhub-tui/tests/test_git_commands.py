"""Tests for /git (pull/push/log/status) — subprocess is monkey-patched.

Phase 2.12 / 11.5 (2026-05-11) — git command paths previously had zero
coverage. We replace subprocess.run with a stub that returns canned
CompletedProcess instances so the tests stay deterministic without
needing a real git repo or network.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from myhub_tui.commands import git as git_cmd
from myhub_tui.core.state import Screen, TuiState


@pytest.fixture
def active_state(state: TuiState) -> TuiState:
    """A state with an active project that has a .git dir."""
    proj = state.root / "content" / "projects" / "alpha"
    (proj / ".git").mkdir(parents=True, exist_ok=True)
    state.active_project = "alpha"
    state.project_root = proj
    state.screen = Screen.PROJECT
    return state


class _Stub:
    """Captures subprocess.run calls + returns canned outputs."""

    def __init__(self) -> None:
        self.calls: list[list[str]] = []
        self.outcomes: list[subprocess.CompletedProcess] = []

    def queue(self, returncode: int, stdout: str = "", stderr: str = "") -> None:
        self.outcomes.append(
            subprocess.CompletedProcess(
                args=["git"], returncode=returncode, stdout=stdout, stderr=stderr,
            )
        )

    def __call__(self, args, **_kwargs):  # type: ignore[no-untyped-def]
        self.calls.append(list(args))
        if not self.outcomes:
            raise AssertionError(f"Unexpected git call: {args}")
        return self.outcomes.pop(0)


# ---------------- guards -----------------------------------------------------


def test_git_no_active(state: TuiState) -> None:
    result = git_cmd.cmd_git(state, ["status"])
    assert result.ok is False
    assert any("Kein aktives Projekt" in line for line in result.lines)


def test_git_no_repo(state: TuiState) -> None:
    proj = state.root / "content" / "projects" / "noisy"
    proj.mkdir(parents=True, exist_ok=True)
    state.active_project = "noisy"
    state.project_root = proj
    result = git_cmd.cmd_git(state, ["status"])
    assert result.ok is False
    assert any("Kein Git-Repo" in line for line in result.lines)


# ---------------- /git pull --------------------------------------------------


def test_git_pull_clean(active_state: TuiState, monkeypatch: pytest.MonkeyPatch) -> None:
    stub = _Stub()
    stub.queue(0, "Already up to date.\n")
    monkeypatch.setattr(subprocess, "run", stub)
    result = git_cmd.cmd_git(active_state, ["pull"])
    assert result.ok is True
    assert any("aktuell" in line for line in result.lines)
    assert stub.calls and stub.calls[0][:3] == ["git", "-C", str(active_state.project_root)]


def test_git_pull_conflict(active_state: TuiState, monkeypatch: pytest.MonkeyPatch) -> None:
    stub = _Stub()
    stub.queue(1, "Automatic merge failed; fix conflicts and then commit the result.\n", "CONFLICT (content): foo.md\n")
    monkeypatch.setattr(subprocess, "run", stub)
    result = git_cmd.cmd_git(active_state, ["pull"])
    assert result.ok is False
    assert any("Konflikt" in line for line in result.lines)


# ---------------- /git push --------------------------------------------------


def test_git_push_ok(active_state: TuiState, monkeypatch: pytest.MonkeyPatch) -> None:
    stub = _Stub()
    stub.queue(0, "", "Everything up-to-date\n")
    monkeypatch.setattr(subprocess, "run", stub)
    result = git_cmd.cmd_git(active_state, ["push"])
    assert result.ok is True


def test_git_push_failure(active_state: TuiState, monkeypatch: pytest.MonkeyPatch) -> None:
    stub = _Stub()
    stub.queue(1, "", "fatal: no upstream\n")
    monkeypatch.setattr(subprocess, "run", stub)
    result = git_cmd.cmd_git(active_state, ["push"])
    assert result.ok is False
    assert any("upstream" in line for line in result.lines)


# ---------------- /git log + /git status -------------------------------------


def test_git_log_default_limit(active_state: TuiState, monkeypatch: pytest.MonkeyPatch) -> None:
    stub = _Stub()
    stub.queue(0, "abc  2 days ago  Initial commit\n")
    monkeypatch.setattr(subprocess, "run", stub)
    result = git_cmd.cmd_git(active_state, ["log"])
    assert result.ok is True
    assert "-n10" in stub.calls[0]


def test_git_log_custom_limit(active_state: TuiState, monkeypatch: pytest.MonkeyPatch) -> None:
    stub = _Stub()
    stub.queue(0, "abc  2 days ago  Initial commit\n")
    monkeypatch.setattr(subprocess, "run", stub)
    git_cmd.cmd_git(active_state, ["log", "25"])
    assert "-n25" in stub.calls[0]


def test_git_status_clean(active_state: TuiState, monkeypatch: pytest.MonkeyPatch) -> None:
    stub = _Stub()
    stub.queue(0, "main\n")    # branch
    stub.queue(0, "")          # status --short
    monkeypatch.setattr(subprocess, "run", stub)
    result = git_cmd.cmd_git(active_state, ["status"])
    assert result.ok is True
    assert any("clean" in line for line in result.lines)


def test_git_status_dirty(active_state: TuiState, monkeypatch: pytest.MonkeyPatch) -> None:
    stub = _Stub()
    stub.queue(0, "main\n")
    stub.queue(0, " M README.md\n M foo.py\n")
    monkeypatch.setattr(subprocess, "run", stub)
    result = git_cmd.cmd_git(active_state, ["status"])
    assert result.ok is True
    assert any("dirty" in line for line in result.lines)


# ---------------- bad sub ----------------------------------------------------


def test_git_bad_subcommand(active_state: TuiState, monkeypatch: pytest.MonkeyPatch) -> None:
    # No subprocess.run should ever fire for an unknown subcommand.
    monkeypatch.setattr(subprocess, "run", lambda *_a, **_kw: pytest.fail("subprocess called"))
    result = git_cmd.cmd_git(active_state, ["fetch"])
    assert result.ok is False
    assert any("Unbekanntes" in line for line in result.lines)
