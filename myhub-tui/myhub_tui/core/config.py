"""User config persisted as TOML at $MYHUB_ROOT/memory/config.toml.

Schema (per SPEC §11.1):

    [user]
    name = "Kolja"
    language = "Mix"

    [editor]
    default = "nvim"

Loads are resilient: missing file → empty config, corrupt TOML → empty
config + a warning once (so the TUI never fails to boot).

Writing uses a hand-rolled TOML emitter for these few keys; we avoid a
`tomli-w` dep to keep the runtime footprint tight.
"""

from __future__ import annotations

import contextlib
import os
import sys
import tempfile
import tomllib
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class UserCfg:
    name: str = ""
    language: str = ""


@dataclass
class EditorCfg:
    default: str = ""


@dataclass
class Config:
    user: UserCfg = field(default_factory=UserCfg)
    editor: EditorCfg = field(default_factory=EditorCfg)

    def needs_onboarding(self) -> bool:
        """An empty name is the canonical "never ran /setup" signal."""
        return not self.user.name.strip()


def config_path(myhub_root: Path) -> Path:
    return myhub_root / "memory" / "config.toml"


def load(myhub_root: Path) -> Config:
    path = config_path(myhub_root)
    if not path.is_file():
        return Config()
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
    except tomllib.TOMLDecodeError as exc:
        print(f"Warning: config.toml parse error: {exc}", file=sys.stderr)
        return Config()

    user_tbl = data.get("user", {}) if isinstance(data.get("user"), dict) else {}
    editor_tbl = data.get("editor", {}) if isinstance(data.get("editor"), dict) else {}

    return Config(
        user=UserCfg(
            name=str(user_tbl.get("name", "")),
            language=str(user_tbl.get("language", "")),
        ),
        editor=EditorCfg(default=str(editor_tbl.get("default", ""))),
    )


def _toml_escape(s: str) -> str:
    """Escape a string for a TOML basic string literal. Enough for names
    and identifiers; not a full TOML encoder.
    """
    return s.replace("\\", "\\\\").replace('"', '\\"')


def save(myhub_root: Path, cfg: Config) -> None:
    """Atomic write with 0600 perms (matches OpenAra's safety level)."""
    path = config_path(myhub_root)
    path.parent.mkdir(parents=True, exist_ok=True)

    sections: list[str] = []

    user_lines = ["[user]"]
    if cfg.user.name:
        user_lines.append(f'name = "{_toml_escape(cfg.user.name)}"')
    if cfg.user.language:
        user_lines.append(f'language = "{_toml_escape(cfg.user.language)}"')
    sections.append("\n".join(user_lines))

    editor_lines = ["[editor]"]
    if cfg.editor.default:
        editor_lines.append(f'default = "{_toml_escape(cfg.editor.default)}"')
    sections.append("\n".join(editor_lines))

    content = "\n\n".join(sections) + "\n"

    fd, tmp_path = tempfile.mkstemp(
        dir=str(path.parent), prefix=".config.", suffix=".tmp"
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(content)
        os.chmod(tmp_path, 0o600)
        os.replace(tmp_path, str(path))
    except BaseException:
        with contextlib.suppress(OSError):
            os.unlink(tmp_path)
        raise
