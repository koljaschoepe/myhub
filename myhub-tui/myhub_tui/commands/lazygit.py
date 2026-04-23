"""/lazygit — exec-replace handoff to lazygit at the active project.

Mirrors commands/ai.py's pattern: writes the .boot/.respawn marker,
then os.execvp. launcher.sh brings the TUI back after lazygit exits.
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path

from myhub_tui.core.state import TuiState
from myhub_tui.core.types import CommandResult


def _write_respawn_marker(root: Path) -> None:
    marker = root / ".boot" / ".respawn"
    marker.parent.mkdir(parents=True, exist_ok=True)
    marker.write_text("1\n", encoding="utf-8")


def cmd_lazygit(state: TuiState, _: list[str]) -> CommandResult:
    if not state.active_project or not state.project_root:
        return CommandResult(
            ok=False,
            lines=["Kein aktives Projekt. Erst /open <name>."],
            style="error",
        )

    binary = shutil.which("lazygit")
    if not binary:
        return CommandResult(
            ok=False,
            lines=[
                "lazygit nicht auf $PATH.",
                "  → brew install lazygit   (oder SSD-Binary nach bin/lazygit)",
            ],
            style="error",
        )

    os.environ["MYHUB_ROOT"] = str(state.root)
    os.environ["MYHUB_PROJECT"] = state.active_project
    _write_respawn_marker(state.root)

    return CommandResult(
        ok=True,
        launch_command=binary,
        launch_cwd=state.project_root,
        style="silent",
    )
