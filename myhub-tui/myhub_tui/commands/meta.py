"""Meta commands: /help, /quit. Adapted from OpenAra's commands/meta.py
but simplified — no context-aware help or welcome wizard yet.
"""

from __future__ import annotations

from rich import box
from rich.padding import Padding
from rich.panel import Panel
from rich.table import Table

from myhub_tui.core.state import TuiState
from myhub_tui.core.theme import DIM, PRIMARY
from myhub_tui.core.types import CommandResult
from myhub_tui.core.ui.output import (
    _adaptive_width,
    _frame_left_pad,
    console,
    content_pad,
)


def cmd_help(state: TuiState, args: list[str]) -> CommandResult:
    """Print grouped help. No args = full overview; <name> = detail."""
    # Avoid a circular import — REGISTRY is populated by the router.
    from myhub_tui.core.registry import REGISTRY

    pad = content_pad()

    if args:
        spec = REGISTRY.get(args[0].lower())
        if not spec:
            # Try alias lookup
            for s in REGISTRY.specs():
                if args[0].lower() in [a.lower() for a in s.aliases]:
                    spec = s
                    break
        if not spec:
            console.print(
                f"{pad}[{DIM}]Unbekannt: {args[0]}. '/help' listet alles.[/{DIM}]",
                highlight=False,
            )
            return CommandResult(ok=True, style="silent")
        console.print()
        console.print(
            f"{pad}[bold {PRIMARY}]{spec.name}[/bold {PRIMARY}]  "
            f"[{DIM}]{spec.help_text}[/{DIM}]",
            highlight=False,
        )
        if spec.aliases:
            console.print(
                f"{pad}  [{DIM}]Aliases:[/{DIM}]  {', '.join(spec.aliases)}",
                highlight=False,
            )
        if spec.subcommands:
            console.print(f"{pad}  [{DIM}]Subcommands:[/{DIM}]", highlight=False)
            for sub, desc in spec.subcommands.items():
                console.print(
                    f"{pad}    [{PRIMARY}]{spec.name} {sub}[/{PRIMARY}]  "
                    f"[{DIM}]{desc}[/{DIM}]",
                    highlight=False,
                )
        console.print()
        return CommandResult(ok=True, style="silent")

    # Full help by category
    console.print()
    w = _adaptive_width() - 4
    left_pad = _frame_left_pad() + 2
    cats = REGISTRY.categories()
    order = ["Projects", "AI", "Git", "System", "Meta"]
    # Include any unrecognized categories at the tail for future-proofing.
    for cat in cats:
        if cat not in order:
            order.append(cat)
    for cat in order:
        specs = cats.get(cat, [])
        if not specs:
            continue
        table = Table(show_header=False, box=None, padding=(0, 1), expand=True)
        table.add_column(style=f"bold {PRIMARY}", no_wrap=True, max_width=12)
        table.add_column(style="default", no_wrap=False)
        table.add_column(style=DIM, no_wrap=False)
        for spec in specs:
            alias = f"({spec.aliases[0]})" if spec.aliases else ""
            table.add_row(spec.name, spec.help_text, alias)
        p = Panel(
            table,
            title=f"[bold {PRIMARY}]{cat}[/bold {PRIMARY}]",
            title_align="left",
            border_style="dim",
            box=box.ROUNDED,
            padding=(0, 1),
            width=w,
        )
        console.print(Padding(p, (0, 0, 0, left_pad)), highlight=False)
        console.print()

    console.print(
        f"{pad}[{DIM}]Tipp: Zahl öffnet Projekt · Slash optional · 'help <cmd>' für Details.[/{DIM}]",
        highlight=False,
    )
    console.print()
    return CommandResult(ok=True, style="silent")


def cmd_quit(_: TuiState, __: list[str]) -> CommandResult:
    pad = content_pad()
    console.print(f"{pad}[{DIM}]tschüss.[/{DIM}]", highlight=False)
    return CommandResult(ok=True, quit_app=True, style="silent")
