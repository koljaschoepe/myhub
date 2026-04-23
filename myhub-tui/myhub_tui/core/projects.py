"""Project registry — persistent YAML at memory/projects.yaml.

Adapted from OpenAra's core/projects.py. Changes:
- Path resolves against MYHUB_ROOT, not $HOME/.config/arasul/.
- ProjectRecord carries myhub's extended schema (display_name,
  last_opened_at, favorite) so the compiler agent and myhub-cli read
  the same records.
- Atomic tempfile+rename for safe writes.
- Self-heal on corrupt YAML: back up, reset to empty.
"""

from __future__ import annotations

import contextlib
import datetime as dt
import os
import shutil
import sys
import tempfile
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import yaml


def registry_path(myhub_root: Path) -> Path:
    return myhub_root / "memory" / "projects.yaml"


@dataclass
class ProjectRecord:
    name: str
    path: str
    display_name: str = ""
    created_at: str = ""
    last_opened_at: str = ""
    favorite: bool = False
    archived: bool = False
    git_remote: str | None = None
    provider_default: str = "claude"

    @classmethod
    def from_dict(cls, item: dict[str, Any]) -> ProjectRecord:
        return cls(
            name=str(item.get("name", "")),
            path=str(item.get("path", "")),
            display_name=str(item.get("display_name", "")),
            created_at=str(item.get("created_at", "")),
            last_opened_at=str(item.get("last_opened_at", "")),
            favorite=bool(item.get("favorite", False)),
            archived=bool(item.get("archived", False)),
            git_remote=item.get("git_remote"),
            provider_default=str(item.get("provider_default", "claude")),
        )

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        # Drop empty-defaults for a tidier YAML.
        for k in ("display_name", "created_at", "last_opened_at"):
            if not d[k]:
                d.pop(k)
        if not d["favorite"]:
            d.pop("favorite")
        if not d["archived"]:
            d.pop("archived")
        if d["git_remote"] is None:
            d.pop("git_remote")
        if d["provider_default"] == "claude":
            d.pop("provider_default")
        return d


def _ensure_registry(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text("projects: []\n", encoding="utf-8")


def load_registry(myhub_root: Path) -> list[ProjectRecord]:
    """Load the project list. Missing file → empty. Corrupt file → back
    up and reset, never raise (TUI must never fail to boot on bad YAML).
    """
    path = registry_path(myhub_root)
    _ensure_registry(path)
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError:
        backup = path.with_suffix(f".yaml.bak.{int(dt.datetime.now().timestamp())}")
        with contextlib.suppress(OSError):
            shutil.copy2(path, backup)
            print(
                f"Warning: corrupt projects.yaml backed up to {backup}",
                file=sys.stderr,
            )
        path.write_text("projects: []\n", encoding="utf-8")
        data = {"projects": []}

    if not isinstance(data, dict):
        data = {}
    items = data.get("projects", [])
    if not isinstance(items, list):
        items = []
    records: list[ProjectRecord] = []
    for item in items:
        if isinstance(item, dict):
            records.append(ProjectRecord.from_dict(item))
    return records


def save_registry(myhub_root: Path, records: list[ProjectRecord]) -> None:
    """Atomic write of the project list."""
    path = registry_path(myhub_root)
    _ensure_registry(path)
    payload = {"projects": [r.to_dict() for r in records]}
    content = yaml.safe_dump(payload, sort_keys=False, allow_unicode=True)
    fd, tmp_path = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as f:
            f.write(content)
        os.replace(tmp_path, str(path))
    except Exception:
        with contextlib.suppress(OSError):
            os.unlink(tmp_path)
        raise


def scan_filesystem(myhub_root: Path) -> list[str]:
    """Discover project directories under content/projects/.

    A directory counts as a project if it has a .myhub-project.toml or
    a .git/ entry or any CLAUDE.md. Returns sorted directory names.
    """
    projects_dir = myhub_root / "content" / "projects"
    if not projects_dir.is_dir():
        return []
    names: list[str] = []
    for child in sorted(projects_dir.iterdir()):
        if not child.is_dir() or child.name.startswith("."):
            continue
        if (
            (child / ".myhub-project.toml").exists()
            or (child / ".git").exists()
            or (child / "CLAUDE.md").exists()
        ):
            names.append(child.name)
    return names


def merge_scanned(
    myhub_root: Path, records: list[ProjectRecord]
) -> list[ProjectRecord]:
    """Add any newly-scanned project dirs to the registry (preserves
    existing metadata). Does NOT remove entries whose directory no
    longer exists — that's a manual /delete decision.

    Archived records are kept in the registry but DO NOT block a
    rescan: if a user deletes a project and then creates a new one
    with the same name, the filesystem scan should be able to surface
    it as a fresh active record (the archived one is preserved for
    audit but superseded).
    """
    by_name: dict[str, ProjectRecord] = {}
    for r in records:
        by_name[r.name] = r

    for name in scan_filesystem(myhub_root):
        existing = by_name.get(name)
        # If an archived record shares the name, treat it as gone and
        # mint a fresh active record. The archived one is overwritten.
        if existing is not None and not existing.archived:
            continue
        by_name[name] = ProjectRecord(
            name=name,
            path=str(myhub_root / "content" / "projects" / name),
            created_at=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        )
    return list(by_name.values())
