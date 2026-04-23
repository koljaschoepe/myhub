"""/verify — shells out to bin/myhub verify and reports the result."""

from __future__ import annotations

import subprocess

from myhub_tui.core.state import TuiState
from myhub_tui.core.theme import DIM
from myhub_tui.core.types import CommandResult


VERIFY_TIMEOUT_SECONDS = 30


def cmd_verify(state: TuiState, args: list[str]) -> CommandResult:
    binary = state.root / "bin" / "myhub"
    if not binary.is_file():
        return CommandResult(
            ok=False,
            lines=[f"bin/myhub fehlt unter {binary}"],
            style="error",
        )

    cmd = [str(binary), "verify", *args]
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(state.root),
            capture_output=True,
            text=True,
            timeout=VERIFY_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        return CommandResult(
            ok=False,
            lines=[f"verify hat {VERIFY_TIMEOUT_SECONDS}s überschritten."],
            style="error",
        )

    lines = [l for l in proc.stdout.splitlines() if l.strip()]
    if proc.returncode == 0:
        if not lines:
            lines = [f"[{DIM}]Manifest ok (keine Ausgabe).[/{DIM}]"]
        return CommandResult(ok=True, lines=lines, style="success")

    lines = lines or ["verify failed."]
    if proc.stderr:
        lines.extend(proc.stderr.splitlines())
    return CommandResult(ok=False, lines=lines, style="error")
