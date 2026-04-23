"""/stats — shells to bin/myhub stats."""

from __future__ import annotations

import subprocess

from myhub_tui.core.state import TuiState
from myhub_tui.core.types import CommandResult


STATS_TIMEOUT_SECONDS = 20


def cmd_stats(state: TuiState, args: list[str]) -> CommandResult:
    binary = state.root / "bin" / "myhub"
    if not binary.is_file():
        return CommandResult(
            ok=False,
            lines=[f"bin/myhub fehlt unter {binary}"],
            style="error",
        )

    try:
        proc = subprocess.run(
            [str(binary), "stats", *args],
            cwd=str(state.root),
            capture_output=True,
            text=True,
            timeout=STATS_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        return CommandResult(
            ok=False,
            lines=[f"stats hat {STATS_TIMEOUT_SECONDS}s überschritten."],
            style="error",
        )

    if proc.returncode != 0:
        err = (proc.stderr or "stats failed").splitlines()
        return CommandResult(ok=False, lines=err, style="error")

    return CommandResult(ok=True, lines=proc.stdout.splitlines())
