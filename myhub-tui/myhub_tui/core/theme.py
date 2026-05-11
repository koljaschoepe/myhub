"""myhub TUI color theme — inherits the OpenAra sci-fi aesthetic.

Palette and glyphs are 1:1 with OpenAra so the two projects feel like
cousins. The only thing that changes between them is the logo itself
(see core/ui/dashboard.LOGO).

Phase 9.1 (2026-05-11): when mounted inside Arasul, the React shell
writes the current theme snapshot to ``$MYHUB_ROOT/.boot/.current-
theme.json``. If that file exists at import-time, the semantic tokens
below get overridden from it — so the TUI's accent matches Arasul's
chosen palette (dark/light, custom theme, etc.). Standalone TUI usage
(no Arasul host) sees the original cyan/green/yellow/red defaults.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

# ---------------------------------------------------------------------------
# Default semantic color tokens (Rich markup names). Overridden below
# when Arasul has written a theme snapshot. The order matters: define
# defaults first, *then* read the snapshot, so module-level imports
# always have something usable.
# ---------------------------------------------------------------------------

PRIMARY = "cyan"  # Main accent — logo, prompts, active items
SUCCESS = "green"  # Checkmarks, clean status, success messages
WARNING = "yellow"  # Warnings, dirty status, caution
ERROR = "red"  # Errors, failures, critical
DIM = "dim"  # Muted text, timestamps, paths


def _load_arasul_theme() -> None:
    """Phase 9.1: pick up the Arasul-host theme snapshot if available.

    Looks at $MYHUB_ROOT (preferred — set by the launcher) or $ARASUL_DRIVE_ROOT,
    falls back to no-op. The file is JSON with a ``rich`` block keyed by
    PRIMARY/SUCCESS/WARNING/ERROR/DIM. Values are hex strings; Rich
    accepts those directly via ``[#7c8ffc]…[/#7c8ffc]`` markup.
    """
    root = os.environ.get("MYHUB_ROOT") or os.environ.get("ARASUL_DRIVE_ROOT")
    if not root:
        return
    snap = Path(root) / ".boot" / ".current-theme.json"
    if not snap.is_file():
        return
    try:
        data = json.loads(snap.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return
    rich = data.get("rich") if isinstance(data, dict) else None
    if not isinstance(rich, dict):
        return
    global PRIMARY, SUCCESS, WARNING, ERROR, DIM
    PRIMARY = rich.get("PRIMARY", PRIMARY) or PRIMARY
    SUCCESS = rich.get("SUCCESS", SUCCESS) or SUCCESS
    WARNING = rich.get("WARNING", WARNING) or WARNING
    ERROR = rich.get("ERROR", ERROR) or ERROR
    DIM = rich.get("DIM", DIM) or DIM


_load_arasul_theme()

# Bar characters (modern block style)
BAR_FILLED = "▰"  # ▰
BAR_EMPTY = "▱"  # ▱

# Status indicators
ICON_OK = f"[{SUCCESS}]✓[/{SUCCESS}]"  # ✓
ICON_WARN = f"[{WARNING}]~[/{WARNING}]"  # ~
ICON_FAIL = f"[{ERROR}]✗[/{ERROR}]"  # ✗
ICON_ARROW = f"[{PRIMARY}]→[/{PRIMARY}]"  # →
ICON_DOT_ON = f"[{SUCCESS}]●[/{SUCCESS}]"  # ●
ICON_DOT_OFF = f"[{DIM}]○[/{DIM}]"  # ○

# Logo gradient — 7 hex steps cyan→indigo. Applied per-column.
LOGO_GRADIENT = [
    "#00d4ff",
    "#10c0ff",
    "#20acff",
    "#3098ff",
    "#4088ff",
    "#4c7cff",
    "#5870ff",
]
