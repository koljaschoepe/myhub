"""config.py — TOML round-trip, missing file, corrupt file, perms."""

from __future__ import annotations

import os
from pathlib import Path

from myhub_tui.core.config import (
    Config,
    EditorCfg,
    UserCfg,
    config_path,
    load,
    save,
)


def test_missing_file_returns_default(tmp_root: Path) -> None:
    cfg = load(tmp_root)
    assert cfg.user.name == ""
    assert cfg.needs_onboarding() is True


def test_round_trip_preserves_all_fields(tmp_root: Path) -> None:
    original = Config(
        user=UserCfg(name="Kolja", language="Mix"),
        editor=EditorCfg(default="nvim"),
    )
    save(tmp_root, original)
    back = load(tmp_root)
    assert back.user.name == "Kolja"
    assert back.user.language == "Mix"
    assert back.editor.default == "nvim"
    assert not back.needs_onboarding()


def test_save_uses_0600_perms(tmp_root: Path) -> None:
    save(tmp_root, Config(user=UserCfg(name="x")))
    mode = config_path(tmp_root).stat().st_mode & 0o777
    # Must not be world- or group-readable.
    assert mode & 0o077 == 0


def test_corrupt_toml_returns_default_without_raise(tmp_root: Path) -> None:
    config_path(tmp_root).write_text("this = is [[ not valid toml", encoding="utf-8")
    cfg = load(tmp_root)
    assert cfg.user.name == ""
    assert cfg.needs_onboarding()


def test_toml_escapes_double_quotes(tmp_root: Path) -> None:
    save(tmp_root, Config(user=UserCfg(name='He said "hi"')))
    back = load(tmp_root)
    assert back.user.name == 'He said "hi"'


def test_empty_fields_are_omitted_from_toml(tmp_root: Path) -> None:
    save(tmp_root, Config(user=UserCfg(name="Kolja")))  # no language, no editor
    text = config_path(tmp_root).read_text(encoding="utf-8")
    assert "language" not in text
    assert "default" not in text
