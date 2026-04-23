"""Shared fixtures for the myhub_tui test suite.

`tmp_root` gives each test an isolated $MYHUB_ROOT with the minimal
directory structure (memory/, content/, .boot/, bin/) so code under
test can write without touching the real SSD.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from myhub_tui.core.state import TuiState


@pytest.fixture
def tmp_root(tmp_path: Path) -> Path:
    """A throwaway myhub-root with the required subdirs."""
    for sub in ("memory", "content/projects", ".boot", "bin"):
        (tmp_path / sub).mkdir(parents=True, exist_ok=True)
    return tmp_path


@pytest.fixture
def state(tmp_root: Path) -> TuiState:
    return TuiState(root=tmp_root)
