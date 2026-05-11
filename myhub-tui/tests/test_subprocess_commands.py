"""Tests for /claude, /brief, /compile, /verify — all shell-out paths.

Phase 2.12 / 11.5 (2026-05-11). Each command's subprocess.run is
monkey-patched so tests don't fork real children. We assert on
CommandResult shape + the launch-command bookkeeping the main loop
relies on.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from myhub_tui.commands import ai as ai_cmd
from myhub_tui.commands import brief as brief_cmd
from myhub_tui.commands import compile as compile_cmd
from myhub_tui.commands import verify as verify_cmd
from myhub_tui.core.state import Screen, TuiState


# ---------------- /claude (no subprocess — exec replacement) -----------------


def test_claude_no_active_project(state: TuiState) -> None:
    result = ai_cmd.cmd_claude(state, [])
    assert result.ok is False
    assert any("Kein aktives Projekt" in line for line in result.lines)


def test_claude_no_binary(
    state: TuiState, monkeypatch: pytest.MonkeyPatch, tmp_path: Path,
) -> None:
    # Active project but resolve_claude returns None.
    proj = state.root / "content" / "projects" / "alpha"
    proj.mkdir(parents=True, exist_ok=True)
    state.active_project = "alpha"
    state.project_root = proj
    monkeypatch.setattr(ai_cmd, "resolve_claude", lambda _root: None)
    result = ai_cmd.cmd_claude(state, [])
    assert result.ok is False
    assert any("Claude nicht gefunden" in line for line in result.lines)


def test_claude_writes_respawn_marker(
    state: TuiState, monkeypatch: pytest.MonkeyPatch,
) -> None:
    proj = state.root / "content" / "projects" / "alpha"
    proj.mkdir(parents=True, exist_ok=True)
    state.active_project = "alpha"
    state.project_root = proj

    fake_bin = state.root / "bin" / "claude"
    fake_bin.write_text("#!/bin/sh\n", encoding="utf-8")
    monkeypatch.setattr(ai_cmd, "resolve_claude", lambda _root: str(fake_bin))

    result = ai_cmd.cmd_claude(state, [])
    assert result.ok is True
    assert result.launch_command == str(fake_bin)
    assert result.launch_cwd == proj
    # The respawn marker tells launcher.sh to relaunch the TUI after
    # the exec-replaced child (claude) exits.
    assert (state.root / ".boot" / ".respawn").is_file()


# ---------------- /brief -----------------------------------------------------


def test_brief_no_binary_falls_back_to_static(
    state: TuiState, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(brief_cmd, "resolve_claude", lambda _root: None)
    result = brief_cmd.cmd_brief(state, [])
    assert result.ok is True
    # Static greeting + a "(Briefer-Agent benötigt bin/claude — aktuell
    # Fallback.)" note.
    assert len(result.lines) >= 1


def test_brief_subprocess_ok(
    state: TuiState, monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_bin = state.root / "bin" / "claude"
    fake_bin.write_text("", encoding="utf-8")
    monkeypatch.setattr(brief_cmd, "resolve_claude", lambda _root: str(fake_bin))

    def fake_run(_args, **_kwargs):  # type: ignore[no-untyped-def]
        return subprocess.CompletedProcess(
            args=_args, returncode=0,
            stdout="Good morning, Kolja. Today: ship Phase 9.", stderr="",
        )
    monkeypatch.setattr(subprocess, "run", fake_run)

    result = brief_cmd.cmd_brief(state, [])
    assert result.ok is True
    assert any("Good morning" in line for line in result.lines)


def test_brief_subprocess_timeout(
    state: TuiState, monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_bin = state.root / "bin" / "claude"
    fake_bin.write_text("", encoding="utf-8")
    monkeypatch.setattr(brief_cmd, "resolve_claude", lambda _root: str(fake_bin))

    def fake_run(_args, **_kwargs):  # type: ignore[no-untyped-def]
        raise subprocess.TimeoutExpired(cmd=_args, timeout=12)
    monkeypatch.setattr(subprocess, "run", fake_run)

    result = brief_cmd.cmd_brief(state, [])
    # Timeout still produces a (fallback) greeting; ok stays True.
    assert result.ok is True
    assert any("Timeout" in line for line in result.lines)


# ---------------- /compile ---------------------------------------------------


def test_compile_no_binary(state: TuiState) -> None:
    # bin/myhub doesn't exist in the test root.
    result = compile_cmd.cmd_compile(state, [])
    assert result.ok is False
    assert any("bin/myhub fehlt" in line for line in result.lines)


def test_compile_success(
    state: TuiState, monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_bin = state.root / "bin" / "myhub"
    fake_bin.write_text("", encoding="utf-8")

    def fake_run(_args, **_kwargs):  # type: ignore[no-untyped-def]
        return subprocess.CompletedProcess(
            args=_args, returncode=0, stdout="compiled 12 notes\n", stderr="",
        )
    monkeypatch.setattr(subprocess, "run", fake_run)

    result = compile_cmd.cmd_compile(state, [])
    assert result.ok is True
    assert any("compiled" in line for line in result.lines)


def test_compile_timeout(
    state: TuiState, monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_bin = state.root / "bin" / "myhub"
    fake_bin.write_text("", encoding="utf-8")

    def fake_run(_args, **_kwargs):  # type: ignore[no-untyped-def]
        raise subprocess.TimeoutExpired(cmd=_args, timeout=300)
    monkeypatch.setattr(subprocess, "run", fake_run)

    result = compile_cmd.cmd_compile(state, [])
    assert result.ok is False
    assert any("5 Minuten überschritten" in line for line in result.lines)


# ---------------- /verify ----------------------------------------------------


def test_verify_no_binary(state: TuiState) -> None:
    result = verify_cmd.cmd_verify(state, [])
    assert result.ok is False
    assert any("bin/myhub fehlt" in line for line in result.lines)


def test_verify_success(
    state: TuiState, monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_bin = state.root / "bin" / "myhub"
    fake_bin.write_text("", encoding="utf-8")

    def fake_run(_args, **_kwargs):  # type: ignore[no-untyped-def]
        return subprocess.CompletedProcess(
            args=_args, returncode=0, stdout="42 files ok\n", stderr="",
        )
    monkeypatch.setattr(subprocess, "run", fake_run)

    result = verify_cmd.cmd_verify(state, [])
    assert result.ok is True


def test_verify_failure(
    state: TuiState, monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_bin = state.root / "bin" / "myhub"
    fake_bin.write_text("", encoding="utf-8")

    def fake_run(_args, **_kwargs):  # type: ignore[no-untyped-def]
        return subprocess.CompletedProcess(
            args=_args, returncode=1, stdout="mismatch in foo.md\n", stderr="",
        )
    monkeypatch.setattr(subprocess, "run", fake_run)

    result = verify_cmd.cmd_verify(state, [])
    assert result.ok is False
    assert any("mismatch" in line for line in result.lines)
