"""Console instance, print helpers, and spinner utilities.

Ported from OpenAra's core/ui/output.py, rebranded for myhub. The
responsive-tier thresholds, print style conventions, and spinner
pattern are 1:1 inherited.
"""

from __future__ import annotations

import os
import threading
import time
from collections.abc import Callable
from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as pkg_version
from typing import TYPE_CHECKING, Any

from rich.console import Console
from rich.live import Live
from rich.spinner import Spinner

from myhub_tui.core.theme import (
    DIM,
    ERROR,
    ICON_ARROW,
    ICON_FAIL,
    ICON_OK,
    PRIMARY,
    SUCCESS,
    WARNING,
)

if TYPE_CHECKING:
    from myhub_tui.core.types import CommandResult


console = Console(no_color=os.environ.get("NO_COLOR") is not None)

try:
    VERSION = f"v{pkg_version('myhub-tui')}"
except PackageNotFoundError:
    VERSION = "dev"

MAX_WIDTH = 84
MIN_WIDTH = 50

TIER_FULL = 78
TIER_MEDIUM = 60


# ---------------------------------------------------------------------------
# Layout helpers
# ---------------------------------------------------------------------------

_HLINE = "─"
_DOT = "·"
_DEG = "°"
_CHECK = "✓"


def _hline(n: int) -> str:
    return _HLINE * n


def _dim_hline(n: int) -> str:
    return f"[{DIM}]{_hline(n)}[/{DIM}]"


def _frame_left_pad() -> int:
    return 1


def content_pad() -> str:
    """Left padding to align output with frame interior."""
    return " " * (_frame_left_pad() + 3)


def _adaptive_width() -> int:
    return max(MIN_WIDTH, min(console.width - 2, MAX_WIDTH))


def content_width() -> int:
    return _adaptive_width() - 10


def truncate(text: str, max_len: int, suffix: str = "…") -> str:
    if len(text) <= max_len:
        return text
    return text[: max_len - len(suffix)] + suffix


# ---------------------------------------------------------------------------
# Print functions
# ---------------------------------------------------------------------------


def print_success(msg: str) -> None:
    pad = content_pad()
    console.print(f"{pad}{ICON_OK} {msg}", highlight=False)


def print_error(msg: str) -> None:
    pad = content_pad()
    console.print(f"{pad}{ICON_FAIL} {msg}", highlight=False)


def print_info(msg: str) -> None:
    pad = content_pad()
    console.print(f"{pad}{ICON_ARROW} {msg}", highlight=False)


def print_warning(msg: str) -> None:
    pad = content_pad()
    console.print(f"{pad}[{WARNING}]![/{WARNING}] {msg}", highlight=False)


def suggest_next(*suggestions: str) -> None:
    if suggestions:
        pad = content_pad()
        console.print(f"{pad}", highlight=False)
        for s in suggestions:
            console.print(f"{pad}  [{DIM}]→[/{DIM}] {s}", highlight=False)


def print_result(result: CommandResult) -> None:
    if not result.lines:
        return

    style = getattr(result, "style", None)
    pad = content_pad()

    if style == "silent":
        return

    if style == "success":
        for line in result.lines:
            console.print(f"{pad}[{SUCCESS}]{line}[/{SUCCESS}]", highlight=False)
    elif style == "error":
        for line in result.lines:
            console.print(f"{pad}[{ERROR}]{line}[/{ERROR}]", highlight=False)
    elif style == "panel":
        from rich import box
        from rich.padding import Padding
        from rich.panel import Panel
        from rich.text import Text as RichText

        w = _adaptive_width() - 4
        inner_w = w - 6
        wrapped_lines: list[str] = []
        for line in result.lines:
            if len(line) > inner_w:
                wrapped_lines.append(line[: inner_w - 1] + "…")
            else:
                wrapped_lines.append(line)
        text = "\n".join(wrapped_lines)
        left_pad = _frame_left_pad() + 2
        p = Panel(
            RichText(text, no_wrap=True, overflow="ellipsis"),
            border_style="dim",
            box=box.ROUNDED,
            padding=(0, 2),
            width=w,
        )
        console.print(Padding(p, (0, 0, 0, left_pad)), highlight=False)
    elif style == "wizard":
        for line in result.lines:
            console.print(f"{pad}{line}", highlight=False)
    else:
        ok = result.ok
        for line in result.lines:
            if not ok and line and not line.startswith(" "):
                console.print(f"{pad}[{ERROR}]{line}[/{ERROR}]", highlight=False)
            else:
                console.print(f"{pad}{line}", highlight=False)


def print_separator(state: Any = None) -> None:
    pad = " " * _frame_left_pad()
    console.print(f"{pad}{_dim_hline(50)}", highlight=False)


# ---------------------------------------------------------------------------
# Spinner
# ---------------------------------------------------------------------------


def spinner_run(msg: str, func: Callable[[], Any]) -> Any:
    """Run func() while showing a dots-spinner. Returns func's result."""
    result = None
    error = None

    def _worker() -> None:
        nonlocal result, error
        try:
            result = func()
        except Exception as exc:
            error = exc

    t = threading.Thread(target=_worker)
    t.start()

    sp = Spinner("dots", text=f"{content_pad()}{msg}", style=PRIMARY)
    with Live(sp, console=console, refresh_per_second=10, transient=True):
        while t.is_alive():
            time.sleep(0.1)

    if error:
        raise error from error
    return result
