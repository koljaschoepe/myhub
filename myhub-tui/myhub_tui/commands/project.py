"""Project commands: /open, /info, /new (wizard), /delete, /repos.

Adapted from OpenAra's commands/project.py. Key differences from
upstream:
- Uses myhub's memory/projects.yaml under MYHUB_ROOT.
- /new creates content/projects/<name>/ with a minimal CLAUDE.md
  stub — no conda/miniforge scaffolding, no template-type flag.
- No /clone yet (port later if needed).
"""

from __future__ import annotations

import datetime as dt
import re
import shutil
from pathlib import Path

from myhub_tui.core.projects import (
    ProjectRecord,
    load_registry,
    merge_scanned,
    save_registry,
)
from myhub_tui.core.state import Screen, TuiState
from myhub_tui.core.theme import DIM, ERROR, PRIMARY, SUCCESS, WARNING
from myhub_tui.core.types import CommandResult


_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9\-]{0,39}$")


def _refresh_registry(state: TuiState) -> None:
    """Populate state.registry from disk + filesystem scan."""
    records = load_registry(state.root)
    records = merge_scanned(state.root, records)
    state.registry = {r.name: r for r in records if not r.archived}


def _sorted_names(state: TuiState) -> list[str]:
    return sorted(state.registry.keys())


# ---------------------------------------------------------------------------
# /repos — list
# ---------------------------------------------------------------------------


def cmd_repos(state: TuiState, _: list[str]) -> CommandResult:
    _refresh_registry(state)
    names = _sorted_names(state)
    if not names:
        return CommandResult(
            ok=True,
            lines=[f"[{DIM}]Noch keine Projekte. '/new' legt eins an.[/{DIM}]"],
        )
    lines = [f"[bold]Projekte ({len(names)})[/bold]"]
    for i, name in enumerate(names, 1):
        r = state.registry[name]
        suffix = ""
        if r.favorite:
            suffix = f"  [{WARNING}]★[/{WARNING}]"
        lines.append(f"  [{PRIMARY}]{i}[/{PRIMARY}]  {name}{suffix}")
    return CommandResult(ok=True, lines=lines)


# ---------------------------------------------------------------------------
# /open <name|index>
# ---------------------------------------------------------------------------


def cmd_open(state: TuiState, args: list[str]) -> CommandResult:
    _refresh_registry(state)
    names = _sorted_names(state)

    if not args:
        return CommandResult(
            ok=False,
            lines=["/open <name> oder /open <nummer>"],
            style="error",
        )

    target_name: str | None = None
    arg = args[0]
    if arg.isdigit():
        idx = int(arg) - 1
        if 0 <= idx < len(names):
            target_name = names[idx]
    else:
        if arg in state.registry:
            target_name = arg
        else:
            prefix = [n for n in names if n.startswith(arg.lower())]
            if len(prefix) == 1:
                target_name = prefix[0]

    if not target_name:
        return CommandResult(
            ok=False,
            lines=[f"Kein Projekt: {arg}"],
            style="error",
        )

    record = state.registry[target_name]
    state.active_project = target_name
    state.project_root = Path(record.path)
    state.screen = Screen.PROJECT

    # Touch last_opened_at
    record.last_opened_at = dt.datetime.now(dt.timezone.utc).isoformat(
        timespec="seconds"
    )
    save_registry(state.root, list(state.registry.values()))

    return CommandResult(
        ok=True,
        # Empty lines — the inline divider the main loop prints via
        # refresh=True already shows "myhub › name" in the header,
        # no need to also print "→ Kontext: …" on its own line.
        lines=[],
        style="silent",
        refresh=True,
    )


# ---------------------------------------------------------------------------
# /info
# ---------------------------------------------------------------------------


def cmd_info(state: TuiState, _: list[str]) -> CommandResult:
    if not state.active_project:
        return CommandResult(
            ok=False,
            lines=["Kein aktives Projekt. Nutze /open oder eine Zahl."],
            style="error",
        )
    _refresh_registry(state)
    r = state.registry.get(state.active_project)
    if not r:
        return CommandResult(
            ok=False,
            lines=[f"Projekt '{state.active_project}' nicht mehr registriert."],
            style="error",
        )

    lines = [
        f"[bold]{r.name}[/bold]",
        f"  [{DIM}]Pfad:     [/{DIM}]{r.path}",
    ]
    if r.display_name:
        lines.append(f"  [{DIM}]Anzeige:  [/{DIM}]{r.display_name}")
    if r.created_at:
        lines.append(f"  [{DIM}]Angelegt: [/{DIM}]{r.created_at}")
    if r.last_opened_at:
        lines.append(f"  [{DIM}]Geöffnet: [/{DIM}]{r.last_opened_at}")
    if r.git_remote:
        lines.append(f"  [{DIM}]Remote:   [/{DIM}]{r.git_remote}")
    if r.favorite:
        lines.append(f"  [{WARNING}]★ Favorit[/{WARNING}]")
    return CommandResult(ok=True, lines=lines)


# ---------------------------------------------------------------------------
# /new — 2-step wizard (name → description)
# ---------------------------------------------------------------------------


def cmd_new(state: TuiState, args: list[str]) -> CommandResult:
    """Start the create-project wizard."""
    # Shortcut: /new <name> skips step 1 if name is valid.
    if args and _NAME_RE.fullmatch(args[0]):
        state._wizard["new_name"] = args[0]
        return CommandResult(
            ok=True,
            prompt="Beschreibung (ein Satz, 'q' bricht ab) ",
            pending_handler=_new_description,
            wizard_step=(2, 2, "Beschreibung"),
            style="silent",
        )
    return CommandResult(
        ok=True,
        prompt="Projektname (klein, a–z0–9 und -, max 40 Zeichen) ",
        pending_handler=_new_name,
        wizard_step=(1, 2, "Name"),
        style="silent",
    )


def _new_name(state: TuiState, raw: str) -> CommandResult:
    name = raw.strip().lower()
    if not _NAME_RE.fullmatch(name):
        return CommandResult(
            ok=False,
            lines=["Name muss klein, a–z0–9 und - enthalten, max 40 Zeichen."],
            style="error",
            prompt="Projektname erneut ",
            pending_handler=_new_name,
            wizard_step=(1, 2, "Name"),
        )
    if name in state.registry:
        return CommandResult(
            ok=False,
            lines=[f"'{name}' existiert bereits."],
            style="error",
            prompt="Anderer Name ",
            pending_handler=_new_name,
            wizard_step=(1, 2, "Name"),
        )
    state._wizard["new_name"] = name
    return CommandResult(
        ok=True,
        prompt="Beschreibung (ein Satz) ",
        pending_handler=_new_description,
        wizard_step=(2, 2, "Beschreibung"),
        style="silent",
    )


def _new_description(state: TuiState, raw: str) -> CommandResult:
    name = state._wizard.pop("new_name", "")
    description = raw.strip()
    state._wizard.clear()

    if not name:
        return CommandResult(
            ok=False,
            lines=["Wizard-State verloren — neu starten mit /new."],
            style="error",
        )

    proj_dir = state.root / "content" / "projects" / name
    if proj_dir.exists():
        return CommandResult(
            ok=False,
            lines=[f"Ordner existiert bereits: {proj_dir}"],
            style="error",
        )

    try:
        proj_dir.mkdir(parents=True, exist_ok=False)
        claude_md = proj_dir / "CLAUDE.md"
        claude_md.write_text(
            f"# {name}\n\n"
            f"{description or '(keine Beschreibung)'}\n\n"
            "## Über dieses Projekt\n\n"
            "Dieses Projekt lebt unter `content/projects/` auf der myhub-SSD.\n"
            "Claude Code wird automatisch mit diesem Pfad als cwd gestartet.\n",
            encoding="utf-8",
        )
    except OSError as exc:
        return CommandResult(
            ok=False,
            lines=[f"Konnte Projekt-Ordner nicht anlegen: {exc}"],
            style="error",
        )

    # Register
    records = load_registry(state.root)
    records.append(
        ProjectRecord(
            name=name,
            path=str(proj_dir),
            display_name=description[:60] if description else "",
            created_at=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        )
    )
    save_registry(state.root, records)
    _refresh_registry(state)

    return CommandResult(
        ok=True,
        lines=[
            f"[{SUCCESS}]✓[/{SUCCESS}] Projekt angelegt: [bold]{name}[/bold]",
            f"  [{DIM}]{proj_dir}[/{DIM}]",
        ],
        refresh_full=True,
    )


# ---------------------------------------------------------------------------
# /delete — 2-step wizard (pick index → confirm y/n)
# ---------------------------------------------------------------------------


def cmd_delete(state: TuiState, _: list[str]) -> CommandResult:
    _refresh_registry(state)
    names = _sorted_names(state)
    if not names:
        return CommandResult(
            ok=True,
            lines=[f"[{DIM}]Nichts zu löschen.[/{DIM}]"],
            style="silent",
        )

    lines = [f"[bold]Welches Projekt soll weg?[/bold]"]
    for i, name in enumerate(names, 1):
        lines.append(f"  [{PRIMARY}]{i}[/{PRIMARY}]  {name}")
    lines.append(f"[{DIM}]Nummer oder Name (q bricht ab)[/{DIM}]")

    return CommandResult(
        ok=True,
        lines=lines,
        prompt="Löschen ",
        pending_handler=_delete_pick,
        wizard_step=(1, 2, "Projekt wählen"),
    )


def _delete_pick(state: TuiState, raw: str) -> CommandResult:
    names = _sorted_names(state)
    arg = raw.strip()
    target: str | None = None
    if arg.isdigit():
        idx = int(arg) - 1
        if 0 <= idx < len(names):
            target = names[idx]
    else:
        # Case-insensitive match — registry keys come from scan/YAML
        # which keeps whatever case exists on disk; users type freely.
        for name in names:
            if name.lower() == arg.lower():
                target = name
                break

    if not target:
        return CommandResult(
            ok=False,
            lines=[f"Unbekannt: {arg}"],
            style="error",
            prompt="Nummer oder Name ",
            pending_handler=_delete_pick,
            wizard_step=(1, 2, "Projekt wählen"),
        )

    state._wizard["delete_target"] = target
    return CommandResult(
        ok=True,
        lines=[
            f"[{WARNING}]!{{!}} content/projects/{target}/ wird mitgelöscht.[/{WARNING}]"
        ],
        style="silent",
        prompt=f"'{target}' wirklich löschen? (y/N) ",
        pending_handler=_delete_confirm,
        wizard_step=(2, 2, "Bestätigen"),
    )


def _delete_confirm(state: TuiState, raw: str) -> CommandResult:
    target = state._wizard.pop("delete_target", "")
    state._wizard.clear()
    answer = raw.strip().lower()

    if answer not in ("y", "yes", "j", "ja"):
        return CommandResult(
            ok=True,
            lines=[f"[{DIM}]Abgebrochen.[/{DIM}]"],
            style="silent",
        )

    proj_dir = state.root / "content" / "projects" / target
    try:
        if proj_dir.exists():
            shutil.rmtree(proj_dir)
    except OSError as exc:
        return CommandResult(
            ok=False,
            lines=[f"Konnte Ordner nicht löschen: {exc}"],
            style="error",
        )

    records = load_registry(state.root)
    records = [r for r in records if r.name != target]
    save_registry(state.root, records)

    if state.active_project == target:
        state.active_project = ""
        state.project_root = None
        state.screen = Screen.MAIN
    _refresh_registry(state)

    return CommandResult(
        ok=True,
        lines=[f"[{ERROR}]✗[/{ERROR}] [bold]{target}[/bold] gelöscht."],
        refresh_full=True,
    )
