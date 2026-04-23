"""First-run onboarding. Triggered on startup when memory/config.toml
has no user.name — prompts for a name, persists it, marks the session
non-first-run.

Scope is minimal on purpose: name only. OpenAra's upstream also asks
language + editor in one go; we keep it to one question here so the
user doesn't drown in prompts at first mount. Additional prefs can be
captured later via an explicit /setup command (Phase 6).
"""

from __future__ import annotations

from myhub_tui.core.config import Config, save
from myhub_tui.core.state import TuiState
from myhub_tui.core.theme import DIM, PRIMARY, SUCCESS
from myhub_tui.core.types import CommandResult


def needs_onboarding(cfg: Config) -> bool:
    return cfg.needs_onboarding()


def start(state: TuiState) -> CommandResult:
    """Emit the initial prompt. The wizard completes via the pending
    handler `_capture_name`.
    """
    lines = [
        "",
        f"[bold {PRIMARY}]Willkommen bei myhub.[/bold {PRIMARY}]",
        "",
        f"[{DIM}]Kurzer Einstieg, dann bist Du drin. Du kannst jede Frage mit 'q' abbrechen.[/{DIM}]",
    ]
    return CommandResult(
        ok=True,
        lines=lines,
        prompt="Wie heißt Du? ",
        pending_handler=_capture_name,
        wizard_step=(1, 1, "Name"),
    )


def _capture_name(state: TuiState, raw: str) -> CommandResult:
    name = raw.strip()
    if not name:
        return CommandResult(
            ok=False,
            lines=["Name darf nicht leer sein."],
            style="error",
            prompt="Wie heißt Du? ",
            pending_handler=_capture_name,
            wizard_step=(1, 1, "Name"),
        )
    if len(name) > 60:
        return CommandResult(
            ok=False,
            lines=["Kürzer bitte (max 60 Zeichen)."],
            style="error",
            prompt="Wie heißt Du? ",
            pending_handler=_capture_name,
            wizard_step=(1, 1, "Name"),
        )

    # Persist and update in-memory state.
    cfg = Config()
    cfg.user.name = name
    try:
        save(state.root, cfg)
    except OSError as exc:
        return CommandResult(
            ok=False,
            lines=[f"Konnte config.toml nicht speichern: {exc}"],
            style="error",
        )
    state.display_name = name

    return CommandResult(
        ok=True,
        lines=[
            f"[{SUCCESS}]✓[/{SUCCESS}] Gespeichert als [bold]{name}[/bold]. "
            "Du kannst sie jederzeit in memory/config.toml ändern.",
            "",
            f"[{DIM}]Tipp: '/help' zeigt alle Kommandos.[/{DIM}]",
        ],
        refresh=True,
    )
