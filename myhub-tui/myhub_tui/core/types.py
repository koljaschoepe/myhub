"""Shared types for the myhub TUI. Ported from OpenAra's core/types.py."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from myhub_tui.core.state import TuiState


# A pending handler is a function that receives the next raw user input
# and returns a CommandResult. This is the OpenAra wizard pattern: a
# handler that wants more input returns a CommandResult with
# pending_handler set; the main loop stores it and calls it on the next
# line of input.
PendingHandler = Callable[["TuiState", str], "CommandResult"]


@dataclass
class CommandResult:
    """Result of executing a command.

    ok              True = handler succeeded; False = user-surfaced error.
    lines           Output lines; rendered by the main loop via print_result.
    refresh         True = re-render the dashboard header after this result.
    quit_app        True = exit the app after this result.
    launch_command  If set, the main loop will os.execvp this command and
                    hand over the TTY. Used for claude/lazygit launches.
    launch_cwd      Working dir to chdir to before launch_command.
    prompt          If set, the main loop shows this as the next prompt
                    label (wizard mode).
    pending_handler If set, the main loop calls this with the next input
                    line instead of going through the registry.
    style           Rendering hint: "silent", "success", "error", "panel",
                    "wizard". Consumed by print_result.
    wizard_step     (current, total, label) — shown in the prompt as
                    "[2/3] Label >".
    unknown_command True = dispatcher could not resolve the input. Used by
                    the main loop to trigger a "did you mean?" suggestion
                    instead of just printing the error lines.
    """

    ok: bool
    lines: list[str] = field(default_factory=list)
    refresh: bool = False
    quit_app: bool = False
    launch_command: str | None = None
    launch_cwd: Path | None = None
    prompt: str | None = None
    pending_handler: PendingHandler | None = None
    style: str | None = None
    wizard_step: tuple[int, int, str] | None = None
    unknown_command: bool = False
