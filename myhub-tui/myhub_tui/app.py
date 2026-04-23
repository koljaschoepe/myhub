"""myhub TUI main loop.

Phase 4: full dispatch via REGISTRY, wizard (pending_handler) support,
numeric project selection, exec-replace for /claude. FileHistory
persists command history across respawns in memory/arasul-history.
"""

from __future__ import annotations

import contextlib
import os
import sys
from pathlib import Path

from prompt_toolkit import PromptSession
from prompt_toolkit.formatted_text import HTML
from prompt_toolkit.history import FileHistory

from myhub_tui.core import config as cfg_mod
from myhub_tui.core import onboarding
from myhub_tui.core.projects import load_registry, merge_scanned
from myhub_tui.core.registry import REGISTRY
from myhub_tui.core.router import build_registry, run_command
from myhub_tui.core.state import Screen, TuiState
from myhub_tui.core.theme import DIM, PRIMARY, WARNING
from myhub_tui.core.types import CommandResult, PendingHandler
from myhub_tui.core.ui.dashboard import build_prompt, print_header
from myhub_tui.core.ui.output import (
    console,
    content_pad,
    print_error,
    print_result,
    print_separator,
    print_warning,
)


def _bootstrap_state() -> tuple[TuiState, cfg_mod.Config]:
    """Build the TuiState, load the project registry + config.toml."""
    state = TuiState()
    records = load_registry(state.root)
    records = merge_scanned(state.root, records)
    state.registry = {r.name: r for r in records if not r.archived}

    config = cfg_mod.load(state.root)

    # Priority for the header greeting: config.user.name → MYHUB_USER env.
    state.display_name = config.user.name or os.environ.get("MYHUB_USER", "")

    return state, config


def _maybe_handle_number(state: TuiState, text: str) -> bool:
    """If text is a numeric index into the project list, open that
    project. Returns True if handled.
    """
    if not text.isdigit():
        return False
    names = sorted(state.registry.keys())
    idx = int(text) - 1
    if 0 <= idx < len(names):
        result = run_command(state, f"/open {names[idx]}")
        _emit(result, state)
        return True
    print_warning(f"Keine Nummer [bold]{text}[/bold] in der Projektliste.")
    return True


def _emit(result: CommandResult, state: TuiState) -> None:
    """Print a result and optionally re-render the header."""
    print_result(result)
    if result.refresh:
        print_header(state, full=True)


def _handle_launch(state: TuiState, result: CommandResult) -> None:
    """Perform os.execvp for a /claude-style command. Does not return on
    success. On failure, clear the respawn marker so launcher.sh doesn't
    loop over a broken binary.
    """
    cmd = result.launch_command
    cwd = result.launch_cwd
    if not cmd or not cwd:
        return

    try:
        os.chdir(str(cwd))
    except OSError as exc:
        _remove_respawn_marker(state.root)
        print_error(f"Verzeichnis nicht erreichbar: {cwd} ({exc})")
        return

    try:
        os.execvp(cmd, [cmd])
    except OSError as exc:
        _remove_respawn_marker(state.root)
        print_error(f"Exec fehlgeschlagen ({cmd}): {exc}")


def _remove_respawn_marker(root: Path) -> None:
    marker = root / ".boot" / ".respawn"
    with contextlib.suppress(OSError):
        marker.unlink(missing_ok=True)


def _suggest(command: str) -> None:
    """Surface possible matches when a command isn't recognized."""
    q = command.lower().strip()
    hits: list[str] = []
    for spec in REGISTRY.specs():
        if q in spec.name or spec.name.startswith(q[:2]):
            hits.append(spec.name)
            continue
        for alias in spec.aliases:
            if q == alias or q in alias:
                hits.append(spec.name)
                break

    seen: list[str] = list(dict.fromkeys(hits))[:3]
    if seen:
        hint = ", ".join(f"[bold]{s}[/bold]" for s in seen)
        print_warning(f"Unbekannt: [bold]{command}[/bold] — meintest du: {hint}?")
    else:
        print_warning(
            f"Unbekannt: [bold]{command}[/bold] — '/help' listet alles."
        )


def run() -> int:
    build_registry()
    try:
        state, config = _bootstrap_state()
    except Exception as exc:
        print_error(f"Startup fehlgeschlagen: {exc}")
        return 1

    history_dir = state.root / "memory" / "myhub_tui"
    with contextlib.suppress(OSError):
        history_dir.mkdir(parents=True, exist_ok=True)
    history_path = history_dir / "history"

    try:
        session: PromptSession[str] = PromptSession(
            history=FileHistory(str(history_path)),
        )
    except Exception as exc:
        print_error(f"Terminal-Init fehlgeschlagen: {exc}")
        return 1

    print_header(state, full=True)

    pending_handler: PendingHandler | None = None
    wizard_step: tuple[int, int, str] | None = None
    pad = content_pad()

    # First-run onboarding: arm the pending handler so the first prompt
    # is the name question. User can type 'q' to bail out.
    if onboarding.needs_onboarding(config):
        welcome = onboarding.start(state)
        print_result(welcome)
        if welcome.pending_handler:
            pending_handler = welcome.pending_handler
            wizard_step = welcome.wizard_step

    while True:
        try:
            prompt_markup = build_prompt(state, wizard_step)
            raw = session.prompt(HTML(prompt_markup))
        except (EOFError, KeyboardInterrupt):
            console.print()
            console.print(f"{pad}[{DIM}]tschüss.[/{DIM}]")
            return 0
        except Exception as exc:
            print_error(f"Terminal-Fehler ({type(exc).__name__}): {exc}")
            return 1

        command = raw.strip()
        if not command:
            continue

        # Wizard mode — delegate to the pending handler. `q` cancels.
        if pending_handler is not None:
            if command.lower() == "q":
                pending_handler = None
                wizard_step = None
                state._wizard.clear()
                console.print(f"{pad}[{DIM}]Abgebrochen.[/{DIM}]")
                continue
            active_handler = pending_handler
            # Clear state BEFORE invoking the handler so a handler exception
            # leaves us in a consistent main-loop state, not trapped in a
            # half-broken wizard the user can't exit.
            pending_handler = None
            wizard_step = None
            try:
                result = active_handler(state, command)
            except Exception as exc:
                state._wizard.clear()
                print_error(f"Wizard-Fehler ({type(exc).__name__}): {exc}")
                continue
            _emit(result, state)
            # Wizard may chain into another step.
            if result.prompt and result.pending_handler:
                pending_handler = result.pending_handler
                wizard_step = result.wizard_step
            else:
                pending_handler = None
                wizard_step = None
            if result.launch_command:
                _handle_launch(state, result)
                return 0
            if result.quit_app:
                return 0
            continue

        # Numeric project selection.
        if _maybe_handle_number(state, command):
            continue

        # Normal registry dispatch.
        result = run_command(state, command)

        # Unknown → suggest.
        if result.unknown_command:
            _suggest(command)
            continue

        _emit(result, state)
        if result.prompt and result.pending_handler:
            pending_handler = result.pending_handler
            wizard_step = result.wizard_step
        if result.launch_command:
            _handle_launch(state, result)
            return 0
        if result.quit_app:
            return 0

        print_separator()


if __name__ == "__main__":
    sys.exit(run() or 0)
