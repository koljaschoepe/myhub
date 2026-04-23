"""myhub TUI color theme — inherits the OpenAra sci-fi aesthetic.

Palette and glyphs are 1:1 with OpenAra so the two projects feel like
cousins. The only thing that changes between them is the logo itself
(see core/ui/dashboard.LOGO).
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Semantic color tokens (Rich markup names)
# ---------------------------------------------------------------------------

PRIMARY = "cyan"  # Main accent — logo, prompts, active items
SUCCESS = "green"  # Checkmarks, clean status, success messages
WARNING = "yellow"  # Warnings, dirty status, caution
ERROR = "red"  # Errors, failures, critical
DIM = "dim"  # Muted text, timestamps, paths

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
