"""/compile — shells to bin/myhub compile (which invokes the compiler
Claude agent headlessly). Runs with a 5-minute ceiling.
"""

from __future__ import annotations

import subprocess

from myhub_tui.core.state import TuiState
from myhub_tui.core.theme import DIM
from myhub_tui.core.types import CommandResult


COMPILE_TIMEOUT_SECONDS = 5 * 60


def cmd_compile(state: TuiState, args: list[str]) -> CommandResult:
    binary = state.root / "bin" / "myhub"
    if not binary.is_file():
        return CommandResult(
            ok=False,
            lines=[f"bin/myhub fehlt unter {binary}"],
            style="error",
        )

    try:
        proc = subprocess.run(
            [str(binary), "compile", *args],
            cwd=str(state.root),
            capture_output=True,
            text=True,
            timeout=COMPILE_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        return CommandResult(
            ok=False,
            lines=["Compile hat 5 Minuten überschritten — abgebrochen."],
            style="error",
        )

    out = proc.stdout.splitlines()
    if proc.returncode != 0:
        err = (proc.stderr or "compile failed").splitlines()
        return CommandResult(ok=False, lines=out + err, style="error")

    if not out:
        out = [f"[{DIM}]compile ok (keine Ausgabe).[/{DIM}]"]
    return CommandResult(ok=True, lines=out, style="success")
