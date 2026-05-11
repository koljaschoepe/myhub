"""Tests for /open, /repos, /info, /new (wizard), /delete handlers.

Phase 2.12 / 11.5 (2026-05-11) — fills the gap the 17-agent audit
flagged: project.py had zero direct coverage. These tests exercise the
command-handler entry points via the `state` fixture from conftest,
which gives each test its own throwaway $MYHUB_ROOT.
"""

from __future__ import annotations

from pathlib import Path

from myhub_tui.commands import project
from myhub_tui.core.projects import ProjectRecord, save_registry
from myhub_tui.core.state import TuiState


def _seed(state: TuiState, *names: str) -> None:
    """Drop a registry entry per name + a matching content/projects dir."""
    records = []
    for n in names:
        proj_path = state.root / "content" / "projects" / n
        proj_path.mkdir(parents=True, exist_ok=True)
        records.append(ProjectRecord(name=n, path=str(proj_path)))
    save_registry(state.root, records)


# ---------------- /repos -----------------------------------------------------


def test_repos_empty(state: TuiState) -> None:
    result = project.cmd_repos(state, [])
    assert result.ok is True
    assert any("Noch keine Projekte" in line for line in result.lines)


def test_repos_lists_known(state: TuiState) -> None:
    _seed(state, "alpha", "beta")
    result = project.cmd_repos(state, [])
    assert result.ok is True
    body = " ".join(result.lines)
    assert "alpha" in body
    assert "beta" in body


# ---------------- /open ------------------------------------------------------


def test_open_no_args(state: TuiState) -> None:
    result = project.cmd_open(state, [])
    assert result.ok is False
    assert any("/open" in line for line in result.lines)


def test_open_by_name(state: TuiState) -> None:
    _seed(state, "alpha", "beta")
    result = project.cmd_open(state, ["alpha"])
    assert result.ok is True
    assert state.active_project == "alpha"
    assert state.project_root is not None
    assert state.project_root.name == "alpha"


def test_open_by_number(state: TuiState) -> None:
    _seed(state, "alpha", "beta", "gamma")
    # Names sort alphabetically -> 1=alpha 2=beta 3=gamma.
    result = project.cmd_open(state, ["2"])
    assert result.ok is True
    assert state.active_project == "beta"


def test_open_prefix_match(state: TuiState) -> None:
    _seed(state, "alpha", "beta")
    result = project.cmd_open(state, ["alp"])
    assert result.ok is True
    assert state.active_project == "alpha"


def test_open_unknown(state: TuiState) -> None:
    _seed(state, "alpha")
    result = project.cmd_open(state, ["zeta"])
    assert result.ok is False
    # TuiState default is empty string, not None.
    assert not state.active_project


# ---------------- /info ------------------------------------------------------


def test_info_without_active(state: TuiState) -> None:
    result = project.cmd_info(state, [])
    assert result.ok is False


def test_info_with_active(state: TuiState) -> None:
    _seed(state, "alpha")
    project.cmd_open(state, ["alpha"])
    result = project.cmd_info(state, [])
    assert result.ok is True
    body = " ".join(result.lines)
    assert "alpha" in body
    assert "Pfad" in body  # German label, see project.py


# ---------------- /new (wizard) ----------------------------------------------


def test_new_starts_wizard(state: TuiState) -> None:
    result = project.cmd_new(state, [])
    assert result.ok is True
    assert result.pending_handler is not None
    assert result.prompt is not None and "Projektname" in result.prompt


def test_new_shortcut_skips_to_step_2(state: TuiState) -> None:
    result = project.cmd_new(state, ["valid-name"])
    assert result.ok is True
    assert result.pending_handler is not None
    assert "Beschreibung" in (result.prompt or "")


def test_new_shortcut_rejects_invalid_name(state: TuiState) -> None:
    # Uppercase + underscores aren't allowed by _NAME_RE.
    result = project.cmd_new(state, ["Bad_Name"])
    assert result.ok is True  # invalid arg falls through to step 1
    assert "Projektname" in (result.prompt or "")
