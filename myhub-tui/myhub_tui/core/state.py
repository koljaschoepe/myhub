"""TUI state — adapted from OpenAra's core/state.py for myhub.

Unlike OpenAra (which targets Linux servers), myhub's state is rooted
at $MYHUB_ROOT (the SSD mount) rather than $HOME. All persistence
lives under $MYHUB_ROOT/memory/.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from myhub_tui.core.projects import ProjectRecord


class Screen(Enum):
    """Which screen the dashboard is rendering."""

    MAIN = "main"
    PROJECT = "project"


def _resolve_root() -> Path:
    """MYHUB_ROOT is the only source of truth for the SSD path.

    Falls back to the parent of the package's own directory when unset
    (dev mode: running from a checkout without the launcher).
    """
    env = os.environ.get("MYHUB_ROOT")
    if env:
        return Path(env)
    # Package root → tui dir → repo root
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / ".boot").is_dir() and (parent / "memory").is_dir():
            return parent
    return Path.cwd()


@dataclass
class TuiState:
    """In-memory state for one TUI session.

    Persistent state lives on disk (memory/projects.yaml, memory/config.toml).
    This object holds what the main loop needs during a run: who you are,
    what context you're in, which wizard (if any) is pending, and the
    current screen.
    """

    # Filesystem roots.
    root: Path = field(default_factory=_resolve_root)

    # Identity — populated from memory/config.toml on first render.
    user: str = ""
    display_name: str = ""

    # Active project context — mirrors OpenAra's state.active_project.
    # Empty string = no context.
    active_project: str = ""
    project_root: Path | None = None

    # Dashboard state.
    screen: Screen = Screen.MAIN
    first_run: bool = False

    # Project registry cache (loaded on demand by commands/project.py).
    # Keyed by project name; value is a ProjectRecord.
    registry: dict[str, "ProjectRecord"] = field(default_factory=dict)

    # Wizard scratchpad — cross-step scratch for pending-handler wizards.
    # Handlers read/write freely; cleared on wizard completion/cancel.
    _wizard: dict[str, Any] = field(default_factory=dict)

    # --- Convenience paths (derived from root) ---

    @property
    def memory_dir(self) -> Path:
        return self.root / "memory"

    @property
    def config_path(self) -> Path:
        return self.memory_dir / "config.toml"

    @property
    def projects_yaml(self) -> Path:
        return self.memory_dir / "projects.yaml"

    @property
    def content_projects_dir(self) -> Path:
        return self.root / "content" / "projects"
