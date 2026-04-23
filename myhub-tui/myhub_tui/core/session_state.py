"""Session-state persistence across os.execvp respawn cycles.

When the user runs /claude or /lazygit, the Python process becomes
Claude/lazygit via os.execvp. launcher.sh brings the TUI back after
the child exits — but as a FRESH process. Without persistence the
user loses their context (active_project, screen) and lands on the
main dashboard instead of where they were.

We write `.boot/.tui-state.json` just before execvp and load it on
startup. The file is a one-shot: after successful load we remove it
so a regular /quit → re-launch doesn't accidentally restore stale
context.
"""

from __future__ import annotations

import contextlib
import json
import os
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from myhub_tui.core.state import TuiState


STATE_FILENAME = ".boot/.tui-state.json"


def path_for(root: Path) -> Path:
    return root / STATE_FILENAME


def save(state: TuiState) -> None:
    """Persist the handful of fields we want to survive a respawn.

    Best-effort: errors are swallowed — a failed save should never
    block the launch itself.
    """
    payload = {
        "active_project": state.active_project,
        "screen": state.screen.value if state.screen else "main",
        "project_root": str(state.project_root) if state.project_root else "",
    }
    try:
        p = path_for(state.root)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(payload), encoding="utf-8")
    except OSError:
        pass


def load_and_consume(root: Path) -> dict | None:
    """One-shot load: read the file, delete it, return the dict.

    Returning None means "no saved session" — either this is a fresh
    mount or the previous exit was clean (/quit).
    """
    p = path_for(root)
    if not p.exists():
        return None
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        with contextlib.suppress(OSError):
            p.unlink()
        return None
    with contextlib.suppress(OSError):
        p.unlink()
    if not isinstance(data, dict):
        return None
    return data


def clear(root: Path) -> None:
    """Remove any stale session-state file."""
    p = path_for(root)
    with contextlib.suppress(OSError):
        p.unlink(missing_ok=True)
