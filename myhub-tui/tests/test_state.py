"""TuiState.root resolution and derived paths."""

from __future__ import annotations

import os
from pathlib import Path

from myhub_tui.core.state import Screen, TuiState


def test_env_var_takes_priority(tmp_root: Path, monkeypatch) -> None:
    monkeypatch.setenv("MYHUB_ROOT", str(tmp_root))
    state = TuiState()
    assert state.root == tmp_root


def test_derived_paths(tmp_root: Path) -> None:
    state = TuiState(root=tmp_root)
    assert state.memory_dir == tmp_root / "memory"
    assert state.config_path == tmp_root / "memory" / "config.toml"
    assert state.projects_yaml == tmp_root / "memory" / "projects.yaml"
    assert state.content_projects_dir == tmp_root / "content" / "projects"


def test_initial_screen_is_main() -> None:
    assert TuiState().screen == Screen.MAIN


def test_wizard_scratch_starts_empty() -> None:
    assert TuiState()._wizard == {}
