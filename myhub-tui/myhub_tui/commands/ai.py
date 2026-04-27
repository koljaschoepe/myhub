"""AI command: /claude. Hands the TTY to Claude Code at the active
project via os.execvp. Before exec, writes .boot/.respawn so the
launcher.sh re-spawn loop brings the TUI back after claude exits.
"""

from __future__ import annotations

import os
from pathlib import Path

from myhub_tui.core.bin_resolve import resolve_claude
from myhub_tui.core.state import TuiState
from myhub_tui.core.types import CommandResult


def _write_respawn_marker(root: Path) -> None:
    """Tell launcher.sh to restart the TUI after the child exits."""
    marker = root / ".boot" / ".respawn"
    marker.parent.mkdir(parents=True, exist_ok=True)
    marker.write_text("1\n", encoding="utf-8")


def cmd_claude(state: TuiState, _: list[str]) -> CommandResult:
    if not state.active_project or not state.project_root:
        return CommandResult(
            ok=False,
            lines=["Kein aktives Projekt. Erst /open <name>."],
            style="error",
        )

    claude_bin = resolve_claude(state.root)
    if not claude_bin:
        return CommandResult(
            ok=False,
            lines=[
                "Claude nicht gefunden (weder bin/claude noch $PATH).",
                "  → checke ob bin/claude auf der SSD ist.",
            ],
            style="error",
        )

    # Propagate SSD-local Claude config so auth stays on-SSD.
    os.environ["CLAUDE_CONFIG_DIR"] = str(state.root / ".claude")
    os.environ["CLAUDE_CODE_PLUGIN_CACHE_DIR"] = str(
        state.root / ".claude" / "plugins"
    )
    os.environ["MYHUB_ROOT"] = str(state.root)
    os.environ["MYHUB_PROJECT"] = state.active_project

    # Mark respawn BEFORE launch_command is acted on by app.run().
    # If the exec itself fails, app.run catches OSError and removes
    # the marker so we don't loop over a dead binary.
    _write_respawn_marker(state.root)

    return CommandResult(
        ok=True,
        launch_command=claude_bin,
        launch_cwd=state.project_root,
        style="silent",
    )
