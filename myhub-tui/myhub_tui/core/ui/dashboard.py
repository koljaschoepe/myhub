"""Dashboard rendering: logo, greeting, system box, project list, prompt.

Adapted from OpenAra's core/ui/dashboard.py. Slimmer than the upstream
because myhub doesn't need Jetson/RPi temperature/GPU metrics, nor the
Linux-only gh/docker status lines. Only RAM + Disk via cross-platform
psutil are shown in the system box. Additional metrics join in later
phases as commands are ported.
"""

from __future__ import annotations

import datetime
import html
import shutil
import time
from typing import TYPE_CHECKING, Any

from rich.markup import escape as _escape_markup
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
    TIER_FULL,
    TIER_MEDIUM,
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


# ---------------------------------------------------------------------------
# Logo — same 2-line block-letter aesthetic as OpenAra, but spells MYHUB.
# Gradient is applied per-line via LOGO_GRADIENT.
# ---------------------------------------------------------------------------

LOGO = [
    "  █▀▄▀█ █▄█ █░█ █░█ █▀▄",
    "  █░▀░█ ░█░ █▀█ █▄█ █▀▄",
]


# ---------------------------------------------------------------------------
# Data helpers
# ---------------------------------------------------------------------------


def _greeting(user: str) -> str:
    """Time-aware German greeting."""
    hour = datetime.datetime.now().hour
    name = user.strip()
    if not name:
        suffix = "."
    else:
        suffix = f", {name}."
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
    """Byte count → '12G' / '740M' terse-units."""
    if bytes_ <= 0:
        return "0"
    units = [("T", 1024**4), ("G", 1024**3), ("M", 1024**2), ("K", 1024)]
    for label, divisor in units:
        if bytes_ >= divisor:
            return f"{bytes_ / divisor:.1f}{label}".rstrip("0").rstrip(".")
    return f"{bytes_}B"


def _system_info(state: TuiState) -> dict[str, Any]:
    """Gather minimal system info (RAM + Disk against SSD root) via psutil.

    Intentionally smaller than OpenAra's version: no temp, no GPU, no
    throttle detection, no docker/github status, no network interface
    probe. macOS doesn't surface these the same way Linux does, and
    myhub doesn't currently need them. Later phases can grow this.
    """
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
    """Return active project names. Stub for Phase 3; Phase 4 wires the
    real projects.yaml registry.
    """
    return sorted(state.registry.keys())


# ---------------------------------------------------------------------------
# Dashboard body
# ---------------------------------------------------------------------------


def _build_full_dashboard(state: TuiState, content_w: int) -> list[str]:
    """Assemble the complete dashboard body (below the logo)."""
    info = _system_info(state)
    lines: list[str] = []
    dot_sep = f" {_DOT} "

    # --- Greeting ---
    lines.append("")
    lines.append(f"  {_greeting(state.display_name or state.user)}")

    # --- Status subtitle: version · hostname (if any) ---
    status_parts: list[str] = [VERSION]
    import socket

    try:
        host = socket.gethostname()
        if host:
            status_parts.append(host)
    except OSError:
        pass
    joined = dot_sep.join(status_parts)
    lines.append(f"  [{DIM}]{joined}[/{DIM}]")
    lines.append("")

    # --- System box ---
    box_w = min(content_w - 2, 46)
    bar_w = max(8, min(10, box_w // 5))
    _corner_tl = "╭"
    _corner_tr = "╮"
    _corner_bl = "╰"
    _corner_br = "╯"
    _vline = "│"

    box_top = f"  [{DIM}]{_corner_tl}{_hline(box_w)}{_corner_tr}[/{DIM}]"
    box_bot = f"  [{DIM}]{_corner_bl}{_hline(box_w)}{_corner_br}[/{DIM}]"
    lines.append(box_top)

    def _box_row_closed(content: str) -> str:
        vis = _vis_len(content)
        if vis > box_w:
            try:
                t = Text.from_markup(content)
                t.truncate(box_w - 1)
                content = f"[{DIM}]{_escape_markup(t.plain)}…[/{DIM}]"
            except Exception:
                content = content[: box_w - 1] + "…"
            vis = _vis_len(content)
        pad_n = max(0, box_w - vis)
        return f"  [{DIM}]{_vline}[/{DIM}]{content}{' ' * pad_n}[{DIM}]{_vline}[/{DIM}]"

    def _metric_row(label: str, bar: str, detail: str) -> str:
        bar_vis = _vis_len(bar)
        used = 2 + 5 + bar_vis + 2
        avail = box_w - used
        detail_vis = _vis_len(detail)
        if detail_vis > avail and avail > 1:
            t = Text.from_markup(detail)
            t.truncate(max(1, avail - 1))
            detail = t.plain + "…"
        return _box_row_closed(f"  {label:<5}{bar}  [{DIM}]{detail}[/{DIM}]")

    ram_pct = float(info.get("ram_pct", 0) or 0)
    lines.append(_metric_row("RAM", _bar(ram_pct, bar_w), info["ram"]))

    disk_pct = float(info.get("disk_pct", 0) or 0)
    lines.append(_metric_row("Disk", _bar(disk_pct, bar_w), info["disk"]))

    lines.append(box_bot)

    # --- Projects ---
    lines.append("")
    lines.append("  [bold]Projekte[/bold]")
    lines.append("")

    projects = _project_list(state)
    for i, name in enumerate(projects, 1):
        safe_name = _escape_markup(name)
        disp_name = safe_name if len(safe_name) <= 28 else safe_name[:27] + "…"
        lines.append(f"  [{PRIMARY}]{i}[/{PRIMARY}]  {disp_name}")

    if not projects:
        lines.append(f"  [{DIM}]Noch keine Projekte.[/{DIM}]")
        lines.append(f"  [{DIM}]Tippe 'new' um eins anzulegen.[/{DIM}]")

    # --- Contextual hints ---
    lines.append("")
    for hint in _build_hints(projects):
        lines.append(f"  [{DIM}]{hint}[/{DIM}]")

    return lines


def _build_hints(projects: list[str]) -> list[str]:
    hints: list[str] = []
    if not projects:
        hints.append("Tippe 'new' um ein Projekt anzulegen, oder 'help' für alle Kommandos.")
    else:
        hints.append("Öffne ein Projekt per Name oder Nummer.")
        hints.append("'help' listet alle Kommandos, 'quit' beendet myhub.")
    return hints


# ---------------------------------------------------------------------------
# Header rendering — tier dispatch
# ---------------------------------------------------------------------------


def _print_header_full(state: TuiState) -> None:
    w = _adaptive_width()
    content_w = w - 6
    pad = content_pad()

    console.print()

    animate = state.first_run
    for i, line in enumerate(LOGO):
        color = LOGO_GRADIENT[i % len(LOGO_GRADIENT)]
        console.print(f"{pad}{line}", style=f"bold {color}", highlight=False)
        if animate:
            time.sleep(0.06)

    for line in _build_full_dashboard(state, content_w):
        console.print(f"{pad}{line}", highlight=False)
    console.print()


def _print_header_medium(state: TuiState) -> None:
    content_w = min(console.width - 6, MAX_WIDTH - 6)
    pad = content_pad()

    console.print()
    for i, line in enumerate(LOGO):
        color = LOGO_GRADIENT[i % len(LOGO_GRADIENT)]
        console.print(f"{pad}{line}", style=f"bold {color}", highlight=False)
    for line in _build_full_dashboard(state, content_w):
        console.print(f"{pad}{line}", highlight=False)
    console.print()


def _print_header_compact(state: TuiState) -> None:
    pad = " " * _frame_left_pad()
    info = _system_info(state)
    console.print()
    console.print(
        f"{pad}[bold {PRIMARY}]myhub[/bold {PRIMARY}] [{DIM}]{VERSION}[/{DIM}]",
        highlight=False,
    )
    ram_pct = float(info.get("ram_pct", 0) or 0)
    disk_pct = float(info.get("disk_pct", 0) or 0)
    console.print(
        f"{pad}RAM {_bar(ram_pct, 6)} [{DIM}]{info['ram']}[/{DIM}]", highlight=False
    )
    console.print(
        f"{pad}Disk {_bar(disk_pct, 6)} [{DIM}]{info['disk']}[/{DIM}]", highlight=False
    )
    projects = _project_list(state)
    if projects:
        console.print(f"{pad}Projekte: {len(projects)}", highlight=False)
    console.print()


def print_header(state: TuiState, full: bool = True) -> None:
    """Render the dashboard header. full=True at startup / context-switch;
    full=False for a slim inline divider between commands.
    """
    if not full:
        pad = content_pad()
        w = _adaptive_width() - 6
        parts: list[str] = []
        if state.active_project:
            name = _escape_markup(state.active_project)
            parts.append(f"[bold]{name}[/bold]")
        else:
            parts.append(f"[{DIM}]main[/{DIM}]")
        dot_sep = f" [{DIM}]{_DOT}[/{DIM}] "
        title_len = _vis_len(dot_sep.join(parts)) + 2
        side = max(1, (w - title_len) // 2)
        right_side = max(1, w - title_len - side)
        joined = dot_sep.join(parts)
        console.print(
            f"{pad}{_dim_hline(side)} {joined} {_dim_hline(right_side)}",
            highlight=False,
        )
        return

    if console.width >= TIER_FULL:
        _print_header_full(state)
    elif console.width >= TIER_MEDIUM:
        _print_header_medium(state)
    else:
        _print_header_compact(state)


# ---------------------------------------------------------------------------
# prompt_toolkit HTML prompt
# ---------------------------------------------------------------------------


def build_prompt(
    state: TuiState, wizard_step: tuple[int, int, str] | None = None
) -> str:
    """Returns prompt_toolkit HTML markup (NOT Rich markup).

    Format:
        main:    "  myhub > "
        project: "  myhub (projname) > "
        wizard:  "  [2/3] Label > "
    """
    pad = " " * (_frame_left_pad() + 2)

    if wizard_step:
        cur, total, label = wizard_step
        safe = html.escape(label)
        return f"{pad}<style fg='yellow'>[{cur}/{total}]</style> {safe} &gt; "

    if state.active_project:
        safe = html.escape(state.active_project)
        return (
            f"{pad}<b><style fg='ansicyan'>myhub</style></b> "
            f"<style fg='ansiblack'>(</style>"
            f"<style fg='ansicyan'>{safe}</style>"
            f"<style fg='ansiblack'>)</style> &gt; "
        )

    return f"{pad}<b><style fg='ansicyan'>myhub</style></b> &gt; "
