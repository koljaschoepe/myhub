"""/brief — invokes the `briefer` Claude Code agent headlessly and
prints the 2–5 line briefing inline. Falls back to a static greeting
if claude is missing or slow.
"""

from __future__ import annotations

import datetime
import os
import subprocess
from pathlib import Path

from myhub_tui.core.state import TuiState
from myhub_tui.core.theme import DIM
from myhub_tui.core.types import CommandResult


BRIEFER_TIMEOUT_SECONDS = 12


def _resolve_claude(root: Path) -> str | None:
    ssd_bin = root / "bin" / "claude"
    if ssd_bin.is_file() and os.access(ssd_bin, os.X_OK):
        return str(ssd_bin)
    import shutil

    return shutil.which("claude")


def _static_greeting(user: str) -> str:
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


def cmd_brief(state: TuiState, _: list[str]) -> CommandResult:
    claude = _resolve_claude(state.root)
    if not claude:
        return CommandResult(
            ok=True,
            lines=[
                _static_greeting(state.display_name or state.user),
                f"[{DIM}](Briefer-Agent benötigt bin/claude — aktuell Fallback.)[/{DIM}]",
            ],
        )

    env = os.environ.copy()
    env["CLAUDE_CONFIG_DIR"] = str(state.root / ".claude")
    env["MYHUB_ROOT"] = str(state.root)

    try:
        proc = subprocess.run(
            [
                claude,
                "-p",
                "--agent",
                "briefer",
                "--output-format",
                "text",
                "Run brief now.",
            ],
            cwd=str(state.root),
            env=env,
            capture_output=True,
            text=True,
            timeout=BRIEFER_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        return CommandResult(
            ok=True,
            lines=[
                _static_greeting(state.display_name or state.user),
                f"[{DIM}](Briefer-Agent Timeout — Fallback angezeigt.)[/{DIM}]",
            ],
        )
    except OSError as exc:
        return CommandResult(
            ok=False,
            lines=[f"Briefer fehlgeschlagen: {exc}"],
            style="error",
        )

    text = proc.stdout.strip() if proc.returncode == 0 else ""
    if not text:
        return CommandResult(
            ok=True,
            lines=[
                _static_greeting(state.display_name or state.user),
                f"[{DIM}](Briefer-Agent lieferte nichts — Fallback.)[/{DIM}]",
            ],
        )

    return CommandResult(ok=True, lines=text.splitlines())
