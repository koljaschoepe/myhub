"""onboarding.start + _capture_name wizard flow."""

from __future__ import annotations

from pathlib import Path

from myhub_tui.core import config as cfg_mod
from myhub_tui.core import onboarding
from myhub_tui.core.state import TuiState


def test_start_returns_pending_handler(tmp_root: Path) -> None:
    state = TuiState(root=tmp_root)
    result = onboarding.start(state)
    assert result.ok is True
    assert result.prompt == "Wie heißt Du? "
    assert result.pending_handler is not None
    assert result.wizard_step == (1, 1, "Name")


def test_empty_input_reprompts(tmp_root: Path) -> None:
    state = TuiState(root=tmp_root)
    first = onboarding.start(state)
    assert first.pending_handler is not None
    follow = first.pending_handler(state, "   ")
    assert follow.ok is False
    assert follow.pending_handler is not None  # re-armed for another try


def test_valid_name_persists_and_refreshes(tmp_root: Path) -> None:
    state = TuiState(root=tmp_root)
    first = onboarding.start(state)
    assert first.pending_handler is not None
    done = first.pending_handler(state, "Kolja")

    assert done.ok is True
    assert done.refresh_full is True
    assert state.display_name == "Kolja"

    on_disk = cfg_mod.load(tmp_root)
    assert on_disk.user.name == "Kolja"
    assert not on_disk.needs_onboarding()


def test_name_too_long_rejected(tmp_root: Path) -> None:
    state = TuiState(root=tmp_root)
    first = onboarding.start(state)
    assert first.pending_handler is not None
    too_long = "x" * 61
    follow = first.pending_handler(state, too_long)
    assert follow.ok is False
    assert follow.pending_handler is not None


def test_needs_onboarding_flips_after_save(tmp_root: Path) -> None:
    # Fresh: empty config → needs onboarding.
    assert onboarding.needs_onboarding(cfg_mod.load(tmp_root))

    # After a valid onboarding run: no longer needed.
    state = TuiState(root=tmp_root)
    first = onboarding.start(state)
    assert first.pending_handler is not None
    first.pending_handler(state, "Anna")
    assert not onboarding.needs_onboarding(cfg_mod.load(tmp_root))
