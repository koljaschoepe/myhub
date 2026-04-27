"""Shared binary resolution for myhub-tui (Phase 6.1 of the master plan).

Mirrors `arasul-app/src-tauri/src/providers/mod.rs::resolve_binary`. Both
projects need to find `claude` (and other AI CLIs) in the same locations
the official installers drop them, plus the SSD-bundled location for
back-compat with users who manually placed binaries on the drive.

Resolution order:
  1. SSD-bundled `bin/<name>` if `ssd_root` is given and the file is executable.
  2. `shutil.which(<name>)` — anywhere on the user's $PATH.
  3. Standard install locations: `~/.local/bin`, `/usr/local/bin`,
     `/opt/homebrew/bin`. (On Windows, only `~/.local/bin`.)

Returns the absolute path as a string, or None if not found.
"""

from __future__ import annotations

import os
import platform
import shutil
from pathlib import Path


def resolve_binary(name: str, ssd_root: Path | None = None) -> str | None:
    """Find `name` in any of the standard locations. See module docstring."""
    if ssd_root is not None:
        ssd_bin = ssd_root / "bin" / name
        if ssd_bin.is_file() and os.access(ssd_bin, os.X_OK):
            return str(ssd_bin)

    on_path = shutil.which(name)
    if on_path:
        return on_path

    home = os.environ.get("HOME") or os.environ.get("USERPROFILE")
    if not home:
        return None

    is_windows = platform.system().lower().startswith("win")
    exe_name = f"{name}.exe" if is_windows else name
    candidates: list[Path]
    if is_windows:
        candidates = [Path(home) / ".local" / "bin" / exe_name]
    else:
        candidates = [
            Path(home) / ".local" / "bin" / exe_name,
            Path("/usr/local/bin") / exe_name,
            Path("/opt/homebrew/bin") / exe_name,
        ]
    for p in candidates:
        if p.is_file() and os.access(p, os.X_OK):
            return str(p)

    return None


def resolve_claude(ssd_root: Path | None = None) -> str | None:
    """Convenience wrapper: `resolve_binary("claude", ssd_root)`."""
    return resolve_binary("claude", ssd_root)
