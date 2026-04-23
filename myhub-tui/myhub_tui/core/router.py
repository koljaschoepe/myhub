"""build_registry() wires all commands into REGISTRY.

Imported by app.py at startup; must be called before REGISTRY is used.
"""

from __future__ import annotations

from myhub_tui.commands.ai import cmd_claude
from myhub_tui.commands.brief import cmd_brief
from myhub_tui.commands.compile import cmd_compile
from myhub_tui.commands.git import cmd_git
from myhub_tui.commands.lazygit import cmd_lazygit
from myhub_tui.commands.meta import cmd_help, cmd_quit
from myhub_tui.commands.project import (
    cmd_delete,
    cmd_info,
    cmd_new,
    cmd_open,
    cmd_repos,
)
from myhub_tui.commands.stats import cmd_stats
from myhub_tui.commands.verify import cmd_verify
from myhub_tui.core.registry import REGISTRY, CommandSpec
from myhub_tui.core.state import TuiState
from myhub_tui.core.types import CommandResult


def build_registry() -> None:
    """Populate the global REGISTRY. Idempotent."""
    if REGISTRY.specs():
        return

    # --- Projects ---
    REGISTRY.register(
        CommandSpec(
            "open",
            cmd_open,
            "Projekt als Kontext setzen",
            category="Projects",
            aliases=["o", "switch", "use"],
        )
    )
    REGISTRY.register(
        CommandSpec(
            "new",
            cmd_new,
            "Neues Projekt anlegen (Wizard)",
            category="Projects",
            aliases=["n", "create"],
        )
    )
    REGISTRY.register(
        CommandSpec(
            "info",
            cmd_info,
            "Details zum aktiven Projekt",
            category="Projects",
            aliases=["i", "details"],
        )
    )
    REGISTRY.register(
        CommandSpec(
            "delete",
            cmd_delete,
            "Projekt löschen (Wizard)",
            category="Projects",
            aliases=["d", "remove"],
        )
    )
    REGISTRY.register(
        CommandSpec(
            "repos",
            cmd_repos,
            "Alle Projekte auflisten",
            category="Projects",
            aliases=["projects", "list", "ls"],
        )
    )

    # --- AI ---
    REGISTRY.register(
        CommandSpec(
            "claude",
            cmd_claude,
            "Claude Code im aktiven Projekt starten (exec-replace)",
            category="AI",
            aliases=["c", "ai"],
        )
    )
    REGISTRY.register(
        CommandSpec(
            "brief",
            cmd_brief,
            "Headless Briefer-Agent neu aufrufen",
            category="AI",
        )
    )

    # --- Git ---
    REGISTRY.register(
        CommandSpec(
            "git",
            cmd_git,
            "Git im aktiven Projekt (pull/push/log/status)",
            category="Git",
            aliases=["pull", "push", "status"],
            subcommands={
                "pull": "git pull",
                "push": "git push",
                "log": "git log -n10",
                "status": "git status --short",
            },
        )
    )
    REGISTRY.register(
        CommandSpec(
            "lazygit",
            cmd_lazygit,
            "lazygit im aktiven Projekt öffnen (exec-replace)",
            category="Git",
            aliases=["g", "lg"],
        )
    )

    # --- System ---
    REGISTRY.register(
        CommandSpec(
            "compile",
            cmd_compile,
            "Wiki neu kompilieren (compiler-Agent, Hintergrund)",
            category="System",
        )
    )
    REGISTRY.register(
        CommandSpec(
            "verify",
            cmd_verify,
            "Manifest gegen SSD prüfen",
            category="System",
        )
    )
    REGISTRY.register(
        CommandSpec(
            "stats",
            cmd_stats,
            "SSD-/Wiki-/Memory-Statistiken",
            category="System",
            aliases=["s"],
        )
    )

    # --- Meta ---
    REGISTRY.register(
        CommandSpec(
            "help",
            cmd_help,
            "Alle Kommandos auflisten",
            category="Meta",
            aliases=["?", "h"],
        )
    )
    REGISTRY.register(
        CommandSpec(
            "quit",
            cmd_quit,
            "myhub beenden",
            category="Meta",
            aliases=["q", "exit", "bye"],
        )
    )


def run_command(state: TuiState, raw: str) -> CommandResult:
    """Resolve `raw` (with or without leading /) against REGISTRY and
    run the handler. Returns a CommandResult; never raises.
    """
    spec, args = REGISTRY.resolve(raw)
    if not spec:
        return CommandResult(
            ok=False,
            lines=[f"Unbekannt: {raw.strip()}"],
            style="error",
            unknown_command=True,
        )
    try:
        return spec.handler(state, args)
    except Exception as exc:
        return CommandResult(
            ok=False,
            lines=[f"Kommando '{spec.name}' fehlgeschlagen: {exc}"],
            style="error",
        )
