"""projects.py — YAML round-trip, atomic save, scan + merge, corrupt-file recovery."""

from __future__ import annotations

from pathlib import Path

import yaml

from myhub_tui.core.projects import (
    ProjectRecord,
    load_registry,
    merge_scanned,
    registry_path,
    save_registry,
    scan_filesystem,
)


def test_load_missing_creates_empty(tmp_root: Path) -> None:
    records = load_registry(tmp_root)
    assert records == []
    assert registry_path(tmp_root).exists()


def test_round_trip_minimal_record(tmp_root: Path) -> None:
    original = [
        ProjectRecord(name="alpha", path=str(tmp_root / "content/projects/alpha"))
    ]
    save_registry(tmp_root, original)
    back = load_registry(tmp_root)
    assert len(back) == 1
    assert back[0].name == "alpha"
    assert back[0].provider_default == "claude"


def test_round_trip_preserves_all_fields(tmp_root: Path) -> None:
    original = [
        ProjectRecord(
            name="myhub",
            path=str(tmp_root / "content/projects/myhub"),
            display_name="My Hub",
            created_at="2026-04-20T12:00:00+00:00",
            last_opened_at="2026-04-23T18:30:00+00:00",
            favorite=True,
            git_remote="git@github.com:kolja/myhub.git",
        )
    ]
    save_registry(tmp_root, original)
    back = load_registry(tmp_root)
    r = back[0]
    assert r.display_name == "My Hub"
    assert r.favorite is True
    assert r.git_remote == "git@github.com:kolja/myhub.git"
    assert r.created_at.startswith("2026-04-20")


def test_empty_defaults_are_trimmed_from_yaml(tmp_root: Path) -> None:
    save_registry(tmp_root, [ProjectRecord(name="a", path="/tmp/a")])
    raw = registry_path(tmp_root).read_text(encoding="utf-8")
    assert "favorite" not in raw
    assert "archived" not in raw
    assert "display_name" not in raw
    assert "git_remote" not in raw


def test_corrupt_yaml_self_heals(tmp_root: Path) -> None:
    # Write garbage in the registry path.
    registry_path(tmp_root).write_text(
        "projects: [ not: valid } bad", encoding="utf-8"
    )
    records = load_registry(tmp_root)
    assert records == []
    # Backup file with timestamp should exist in the same dir.
    backups = list(registry_path(tmp_root).parent.glob("projects.yaml.bak.*"))
    assert len(backups) == 1


def test_scan_finds_projects_with_markers(tmp_root: Path) -> None:
    pdir = tmp_root / "content" / "projects"
    (pdir / "has-toml").mkdir()
    (pdir / "has-toml" / ".myhub-project.toml").write_text("", encoding="utf-8")
    (pdir / "has-claude-md").mkdir()
    (pdir / "has-claude-md" / "CLAUDE.md").write_text("# test\n", encoding="utf-8")
    (pdir / "has-git").mkdir()
    (pdir / "has-git" / ".git").mkdir()
    (pdir / "no-marker").mkdir()  # should NOT be picked up

    found = scan_filesystem(tmp_root)
    assert "has-toml" in found
    assert "has-claude-md" in found
    assert "has-git" in found
    assert "no-marker" not in found


def test_merge_scanned_preserves_existing_metadata(tmp_root: Path) -> None:
    pdir = tmp_root / "content" / "projects"
    (pdir / "alpha").mkdir()
    (pdir / "alpha" / "CLAUDE.md").write_text("", encoding="utf-8")
    (pdir / "beta").mkdir()
    (pdir / "beta" / "CLAUDE.md").write_text("", encoding="utf-8")

    existing = [
        ProjectRecord(
            name="alpha",
            path=str(pdir / "alpha"),
            display_name="Old Alpha",
            favorite=True,
        )
    ]
    merged = merge_scanned(tmp_root, existing)
    by_name = {r.name: r for r in merged}

    # Alpha keeps its display_name + favorite.
    assert by_name["alpha"].display_name == "Old Alpha"
    assert by_name["alpha"].favorite is True
    # Beta is new with defaults.
    assert by_name["beta"].display_name == ""
    assert by_name["beta"].favorite is False


def test_merge_scanned_does_not_remove_missing_dirs(tmp_root: Path) -> None:
    """Archived/removed dirs stay in the registry — /delete is explicit."""
    existing = [ProjectRecord(name="ghost", path=str(tmp_root / "content/projects/ghost"))]
    merged = merge_scanned(tmp_root, existing)
    assert any(r.name == "ghost" for r in merged)
