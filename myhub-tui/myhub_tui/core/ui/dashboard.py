"""Dashboard rendering: logo, status bar, greeting, system box, project
panel, hint bar, prompt.

Layout tiers (viewport widths):
- FULL    ≥ 100 cols — 6-line ANSI-shadow logo + status bar + side-by-
                       side system+today + panel'd project list + hint
- MEDIUM  ≥ 78  cols — 2-line compact logo, stacked system/projects
- COMPACT < 78  cols — single-line wordmark, mini bars only
- SLIM    < 60  cols — COMPACT already caps here
"""

from __future__ import annotations

import datetime
import html
import shutil
import socket
import sys
import time
from typing import TYPE_CHECKING, Any

from rich import box
from rich.markup import escape as _escape_markup
from rich.padding import Padding
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from myhub_tui.core.theme import (
    DIM,
    LOGO_GRADIENT,
    PRIMARY,
    SUCCESS,
    WARNING,
)
from myhub_tui.core.ui.output import (
    MAX_WIDTH,
    VERSION,
    _CHECK,
    _DOT,
    _adaptive_width,
    _dim_hline,
    _frame_left_pad,
    _hline,
    console,
    content_pad,
)
from myhub_tui.core.ui.panels import _bar, _vis_len

if TYPE_CHECKING:
    from myhub_tui.core.state import TuiState


# Tier breakpoints — tuned up per Phase-8 audit: the old 60/78 was too
# tight, real terminals today sit at 100+ cols.
TIER_FULL_V3 = 100
TIER_MEDIUM_V3 = 78


# ---------------------------------------------------------------------------
# Logos — tier-scaled
# ---------------------------------------------------------------------------

# FULL-tier logo: "ANSI Shadow"-style for impact at ≥100 cols. 6 lines,
# 46 chars wide. Gradient is applied per column so the cyan→indigo wash
# runs horizontally across each letter.
LOGO_FULL = [
    "███╗   ███╗██╗   ██╗██╗  ██╗██╗   ██╗██████╗ ",
    "████╗ ████║╚██╗ ██╔╝██║  ██║██║   ██║██╔══██╗",
    "██╔████╔██║ ╚████╔╝ ███████║██║   ██║██████╔╝",
    "██║╚██╔╝██║  ╚██╔╝  ██╔══██║██║   ██║██╔══██╗",
    "██║ ╚═╝ ██║   ██║   ██║  ██║╚██████╔╝██████╔╝",
    "╚═╝     ╚═╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ",
]

# MEDIUM-tier logo: 2-line compact. Same pattern we shipped in v3 Phase 3.
LOGO_MEDIUM = [
    "█▀▄▀█ █▄█ █░█ █░█ █▀▄",
    "█░▀░█ ░█░ █▀█ █▄█ █▀▄",
]


# ---------------------------------------------------------------------------
# Greeting
# ---------------------------------------------------------------------------


def _greeting(user: str) -> str:
    hour = datetime.datetime.now().hour
    name = user.strip()
    suffix = f", {name}." if name else "."
    if hour < 2:
        return f"Späte Session{suffix}"
    if hour < 6:
        return f"Noch wach{suffix}"
    if hour < 12:
        return f"Guten Morgen{suffix}"
    if hour < 17:
        return f"Guten Tag{suffix}"
    if hour < 22:
        return f"Guten Abend{suffix}"
    return f"Späte Session{suffix}"


def _human_gib(bytes_: int) -> str:
    if bytes_ <= 0:
        return "0"
    units = [("T", 1024**4), ("G", 1024**3), ("M", 1024**2), ("K", 1024)]
    for label, divisor in units:
        if bytes_ >= divisor:
            return f"{bytes_ / divisor:.1f}{label}".rstrip("0").rstrip(".")
    return f"{bytes_}B"


def _system_info(state: TuiState) -> dict[str, Any]:
    try:
        import psutil
    except ImportError:
        return {"ram_pct": 0, "ram": "n/a", "disk_pct": 0, "disk": "n/a"}

    vm = psutil.virtual_memory()
    ram_used = vm.total - vm.available
    ram_str = f"{_human_gib(ram_used)}/{_human_gib(vm.total)}"

    try:
        du = shutil.disk_usage(str(state.root))
        disk_pct = du.used / du.total * 100
        disk_str = f"{_human_gib(du.used)}/{_human_gib(du.total)}"
    except OSError:
        disk_pct = 0.0
        disk_str = "n/a"

    return {
        "ram_pct": vm.percent,
        "ram": ram_str,
        "disk_pct": disk_pct,
        "disk": disk_str,
    }


def _project_list(state: TuiState) -> list[str]:
    return sorted(state.registry.keys())


# ---------------------------------------------------------------------------
# Status bar (TOP)
# ---------------------------------------------------------------------------


def _status_bar_text(state: TuiState) -> str:
    """Build the top-of-screen status line — Claude-Code-style."""
    host = ""
    try:
        host = socket.gethostname()
    except OSError:
        pass

    py = f"py{sys.version_info.major}.{sys.version_info.minor}"
    projs = len(_project_list(state))
    path_display = str(state.root).replace(str(_home()), "~", 1)
    if len(path_display) > 42:
        path_display = "…" + path_display[-41:]

    if state.active_project:
        lead = f"[bold {PRIMARY}]myhub[/bold {PRIMARY}] › [bold]{_escape_markup(state.active_project)}[/bold]"
    else:
        lead = f"[bold {PRIMARY}]myhub[/bold {PRIMARY}]"

    parts = [
        lead,
        f"[{DIM}]{_escape_markup(path_display)}[/{DIM}]",
        f"[{DIM}]{VERSION}[/{DIM}]",
        f"[{DIM}]{py}[/{DIM}]",
    ]
    if host:
        parts.append(f"[{DIM}]{_escape_markup(host)}[/{DIM}]")
    parts.append(f"[{DIM}]{projs} Projekte[/{DIM}]")

    return f" [{DIM}]{_DOT}[/{DIM}] ".join(parts)


def _home():
    from pathlib import Path

    return Path.home()


def _render_status_bar(state: TuiState) -> None:
    """Print a single-line status bar at the top, flanked by dim rules."""
    w = min(console.width - 2, MAX_WIDTH)
    inner = _status_bar_text(state)
    inner_vis = _vis_len(inner)
    left_rule = _dim_hline(2)
    right_space = max(3, w - inner_vis - 6)
    right_rule = _dim_hline(right_space)
    console.print(f" {left_rule} {inner} {right_rule}", highlight=False)


# ---------------------------------------------------------------------------
# Hint bar (BOTTOM) — persistent keybinding footer
# ---------------------------------------------------------------------------


def render_hint_bar() -> None:
    """Print a single-line hint bar just above the prompt. Printed once
    per turn by app.run() before session.prompt().
    """
    pad = " " * _frame_left_pad()
    hints = (
        f"[{DIM}]/ [/{DIM}][bold {PRIMARY}]Kommandos[/bold {PRIMARY}]"
        f"  [{DIM}]·[/{DIM}]  [bold {PRIMARY}]Tab[/bold {PRIMARY}] [{DIM}]vervollst.[/{DIM}]"
        f"  [{DIM}]·[/{DIM}]  [bold {PRIMARY}]↵[/bold {PRIMARY}] [{DIM}]ausführen[/{DIM}]"
        f"  [{DIM}]·[/{DIM}]  [bold {PRIMARY}]^C[/bold {PRIMARY}] [{DIM}]beenden[/{DIM}]"
    )
    console.print(f"{pad}{hints}", highlight=False)


# ---------------------------------------------------------------------------
# Logo renderer — gradient per column
# ---------------------------------------------------------------------------


def _render_logo(state: TuiState, tier: str) -> None:
    """Print the appropriate-tier logo with gradient colors."""
    pad = content_pad()
    if tier == "compact":
        # One-line wordmark with column gradient.
        wordmark = "myhub"
        painted = []
        grad = LOGO_GRADIENT
        for i, ch in enumerate(wordmark):
            idx = i * (len(grad) - 1) // max(len(wordmark) - 1, 1)
            painted.append(f"[bold {grad[idx]}]{ch}[/bold {grad[idx]}]")
        console.print(f"{pad}{''.join(painted)}", highlight=False)
        return

    lines = LOGO_FULL if tier == "full" else LOGO_MEDIUM
    grad = LOGO_GRADIENT
    animate = state.first_run and tier == "full"
    for _, line in enumerate(lines):
        # Per-column gradient — cyan on left, indigo on right.
        n = len(line)
        segs: list[str] = []
        for col, ch in enumerate(line):
            idx = col * (len(grad) - 1) // max(n - 1, 1)
            color = grad[idx]
            segs.append(f"[bold {color}]{ch}[/bold {color}]")
        console.print(f"{pad}{''.join(segs)}", highlight=False)
        if animate:
            time.sleep(0.04)


# ---------------------------------------------------------------------------
# Panels — greeting, system, today, projects
# ---------------------------------------------------------------------------


def _render_greeting_line(state: TuiState) -> None:
    pad = content_pad()
    console.print(
        f"{pad}[bold]{_greeting(state.display_name or state.user)}[/bold]",
        highlight=False,
    )


def _render_system_panel(state: TuiState, width: int) -> Panel:
    info = _system_info(state)
    ram_pct = float(info.get("ram_pct", 0) or 0)
    disk_pct = float(info.get("disk_pct", 0) or 0)
    bar_w = 10
    table = Table(show_header=False, box=None, padding=(0, 1), expand=False)
    table.add_column(style="bold", no_wrap=True)
    table.add_column(no_wrap=True)
    table.add_column(style=DIM, no_wrap=True)
    table.add_row("RAM", _bar(ram_pct, bar_w), info["ram"])
    table.add_row("Disk", _bar(disk_pct, bar_w), info["disk"])
    return Panel(
        table,
        title=f"[bold {PRIMARY}]System[/bold {PRIMARY}]",
        title_align="left",
        border_style="dim",
        box=box.ROUNDED,
        padding=(0, 1),
        width=width,
    )


def _render_projects_panel(state: TuiState, width: int) -> Panel:
    projs = _project_list(state)
    table = Table(show_header=False, box=None, padding=(0, 1), expand=True)
    table.add_column(style=f"bold {PRIMARY}", no_wrap=True, width=3)
    table.add_column(no_wrap=False)
    table.add_column(style=DIM, no_wrap=True, justify="right")

    if not projs:
        table.add_row(
            f"[{DIM}]—[/{DIM}]",
            f"[{DIM}]Noch keine Projekte.[/{DIM}]",
            f"[{DIM}]/new[/{DIM}]",
        )
    else:
        for i, name in enumerate(projs, 1):
            safe_name = _escape_markup(name)
            record = state.registry.get(name)
            meta = ""
            if record and record.last_opened_at:
                ts = record.last_opened_at.split("T")[0] if "T" in record.last_opened_at else ""
                meta = f"{ts}"
            if state.active_project == name:
                row_name = f"[bold {SUCCESS}]{safe_name}[/bold {SUCCESS}] [{SUCCESS}]{_CHECK}[/{SUCCESS}]"
            else:
                row_name = safe_name
            table.add_row(str(i), row_name, meta)

    return Panel(
        table,
        title=f"[bold {PRIMARY}]Projekte[/bold {PRIMARY}]",
        title_align="left",
        border_style="dim",
        box=box.ROUNDED,
        padding=(0, 1),
        width=width,
    )


# ---------------------------------------------------------------------------
# Tier dispatch
# ---------------------------------------------------------------------------


def _print_header_full(state: TuiState) -> None:
    """≥100 cols: status bar + big logo + greeting + panels."""
    w = min(console.width - 4, MAX_WIDTH + 10)
    left_pad = _frame_left_pad() + 2

    _render_status_bar(state)
    console.print()
    _render_logo(state, "full")
    console.print()
    _render_greeting_line(state)
    console.print()

    # System panel left-aligned, then projects panel below. Two-column
    # layout only when there's room for it (≥110 cols).
    sys_panel = _render_system_panel(state, width=min(48, w // 2 - 2))
    proj_panel = _render_projects_panel(state, width=w)
    console.print(Padding(sys_panel, (0, 0, 0, left_pad)), highlight=False)
    console.print()
    console.print(Padding(proj_panel, (0, 0, 0, left_pad)), highlight=False)
    console.print()


def _print_header_medium(state: TuiState) -> None:
    """≥78 cols: compact logo + panels."""
    w = min(console.width - 4, MAX_WIDTH)
    left_pad = _frame_left_pad() + 2

    _render_status_bar(state)
    console.print()
    _render_logo(state, "medium")
    console.print()
    _render_greeting_line(state)
    console.print()

    sys_panel = _render_system_panel(state, width=w)
    proj_panel = _render_projects_panel(state, width=w)
    console.print(Padding(sys_panel, (0, 0, 0, left_pad)), highlight=False)
    console.print()
    console.print(Padding(proj_panel, (0, 0, 0, left_pad)), highlight=False)
    console.print()


def _print_header_compact(state: TuiState) -> None:
    """<78 cols: minimalist wordmark, mini bars, text list."""
    pad = " " * _frame_left_pad()
    info = _system_info(state)
    ram_pct = float(info.get("ram_pct", 0) or 0)
    disk_pct = float(info.get("disk_pct", 0) or 0)

    console.print()
    _render_logo(state, "compact")
    console.print(f"{pad}[{DIM}]{VERSION}[/{DIM}]", highlight=False)
    console.print()
    console.print(f"{pad}[bold]{_greeting(state.display_name or state.user)}[/bold]")
    console.print()
    console.print(
        f"{pad}RAM {_bar(ram_pct, 6)} [{DIM}]{info['ram']}[/{DIM}]",
        highlight=False,
    )
    console.print(
        f"{pad}Disk {_bar(disk_pct, 6)} [{DIM}]{info['disk']}[/{DIM}]",
        highlight=False,
    )
    console.print()
    projs = _project_list(state)
    if projs:
        console.print(f"{pad}[bold]Projekte:[/bold] {len(projs)}")
        for i, name in enumerate(projs, 1):
            marker = f"[{SUCCESS}]{_CHECK}[/{SUCCESS}]" if state.active_project == name else " "
            console.print(f"{pad}  [{PRIMARY}]{i}[/{PRIMARY}]  {_escape_markup(name)} {marker}")
    else:
        console.print(f"{pad}[{DIM}]Keine Projekte — /new legt eins an.[/{DIM}]")
    console.print()


def print_header(state: TuiState, full: bool = True) -> None:
    """Render the dashboard. full=True at startup / when the project
    list changes; full=False for an inline divider between turns
    (context-switch without the whole dashboard scrolling by).
    """
    if not full:
        pad = content_pad()
        w = _adaptive_width() - 6
        if state.active_project:
            label = f"[bold {PRIMARY}]myhub[/bold {PRIMARY}] › [bold]{_escape_markup(state.active_project)}[/bold]"
        else:
            label = f"[{DIM}]myhub (main)[/{DIM}]"
        label_len = _vis_len(label) + 2
        side = max(1, (w - label_len) // 2)
        right = max(1, w - label_len - side)
        console.print(
            f"{pad}{_dim_hline(side)} {label} {_dim_hline(right)}",
            highlight=False,
        )
        return

    width = console.width
    if width >= TIER_FULL_V3:
        _print_header_full(state)
    elif width >= TIER_MEDIUM_V3:
        _print_header_medium(state)
    else:
        _print_header_compact(state)

    # The hint bar belongs to the dashboard, not the prompt loop. Rendering
    # it here means it appears once per screen paint (initial banner, plus
    # any `refresh_full=True` command result) — not once per keystroke.
    render_hint_bar()


# ---------------------------------------------------------------------------
# prompt_toolkit HTML prompt
# ---------------------------------------------------------------------------


def build_prompt(
    state: TuiState, wizard_step: tuple[int, int, str] | None = None
) -> str:
    """prompt_toolkit HTML (not Rich markup).

    Styles:
        main:    "  myhub ❯ "
        project: "  myhub › projname ❯ "
        wizard:  "  [2/3] Label > "
    """
    pad = " " * (_frame_left_pad() + 2)

    if wizard_step:
        cur, total, label = wizard_step
        safe = html.escape(label)
        return (
            f"{pad}<style fg='yellow'>[{cur}/{total}]</style>"
            f" {safe} <b>❯</b> "
        )

    if state.active_project:
        safe = html.escape(state.active_project)
        return (
            f"{pad}<b><style fg='ansicyan'>myhub</style></b>"
            f" <style fg='ansiblack'>›</style>"
            f" <b>{safe}</b>"
            f" <style fg='ansicyan'><b>❯</b></style> "
        )

    return (
        f"{pad}<b><style fg='ansicyan'>myhub</style></b>"
        f" <style fg='ansicyan'><b>❯</b></style> "
    )
