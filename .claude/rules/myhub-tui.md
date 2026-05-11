---
name: myhub-tui rules
paths:
  - "myhub-tui/**/*.py"
  - "myhub-tui/pyproject.toml"
  - "myhub-tui/README.md"
  - "bin/myhub-tui"
  - "bin/arasul-tui-pane"
---

# myhub-tui — Python TUI rules

Loaded only when editing files matching `paths:` above.

## Stack

- Python 3.13+ (via `runtime/python/`, SSD-portable, NOT host Python)
- `prompt_toolkit` (PromptSession, completion, history)
- `rich` (Console, Panel, Table)
- `pytest` for tests

Run tests:
```bash
cd myhub-tui && PYTHONPATH=. ../runtime/python/bin/python3 -m pytest tests/
```

## Adding a command (the canonical pattern)

1. Create `myhub_tui/commands/<name>.py` with handler:
   ```python
   from ..core.types import CommandResult
   from ..core.state import TuiState

   def cmd_<name>(state: TuiState, args: list[str]) -> CommandResult:
       # ... do work ...
       return CommandResult(ok=True, lines=["Done."])
   ```
2. Register in `myhub_tui/core/router.py` inside `build_registry()`:
   ```python
   registry.register(CommandSpec(
       name="<name>",
       handler=commands.<name>.cmd_<name>,
       help_text="One-line description.",
       category="Projects" | "AI" | "Git" | "System" | "Meta",
       aliases=["<short>"],
   ))
   ```
3. Add a test under `tests/test_<name>.py` mocking subprocess where needed.

Canonical example: `myhub_tui/commands/project.py:71-112` (`/open`) — simple state-mutating command. For multi-step wizards, see `cmd_new` in the same file.

## CommandResult contract

`CommandResult` (defined in `core/types.py`) is the **only** return type:
- `ok: bool` — success
- `lines: list[str]` — Rich-markup text to render
- `style: str | None` — overall style class
- `pending_handler: Callable | None` — set for wizard step continuations
- `prompt: str | None` — next prompt label for wizard
- `launch_command: str | None` — exec-replace TUI with this command (e.g. `/claude`, `/lazygit`)
- `launch_cwd: Path | None` — working dir for `launch_command`
- `refresh: bool` — redraw context divider
- `refresh_full: bool` — redraw dashboard

**Do not** invent ad-hoc return shapes.

## AI integration (subscription-only)

For interactive Claude: hand the TTY over with `os.execvp` (see `commands/ai.py:32-69`).
For headless agent calls: `subprocess.run(["claude", "-p", "--agent", "<agent>", prompt])` (see `commands/brief.py:47-104`).

**Never** import `anthropic`, `openai`, or any SDK. The `PreToolUse` hook will block edits/writes that contain such imports unless the file carries `# arasul:allow-api-sdk` with a justification (and even then: ask first).

`resolve_claude(root)` lives in `core/bin_resolve.py` and is imported by both `commands/ai.py` and `commands/brief.py`. Don't reintroduce a per-command copy. (Phase 2.13 of frontend-ux-overhaul verified the extraction; previous "duplicated" note here was stale.)

## Wizard pattern

Multi-step flows return `CommandResult(pending_handler=next_step, prompt="…")`. The main loop (`app.py:259-291`) calls `pending_handler(input)` on the next user line. Cancel on `q`. See `commands/project.py:115-182` for the canonical 2-step wizard.

For interactive *clarifications inside a single command*, prefer surfacing through the Tauri `AskUserQuestion` flow if the TUI is mounted in Arasul. Standalone TUI: stay with the wizard pattern (no AskUserQuestion equivalent yet).

## Reserved Arasul host shortcuts

When the TUI is mounted inside the Arasul right pane, the React shell
intercepts keystrokes at the window level and they never reach the
embedded process. **Don't bind these in `prompt_toolkit` key bindings**
— users won't see your handler fire, and they'll think it's broken.

- `⌘K` / `Ctrl+K` — opens the command palette (App.tsx).
- `⌘L` — focuses the right pane (Phase 7.1 Cursor convention).
- `⌘⇧L` — locks the drive.
- `⌘P` / `⌘⇧P` — open file / project finder.
- `⌘⇧F` — search across files.
- `⌘,` / `⌘/` / `⌘;` — Settings / Shortcuts / Focus mode.
- `⌘T` / `⌘W` / `⌘1..9` — terminal-tab management.
- `Esc` — closes any open overlay before reaching the TUI.

Other shortcuts (incl. `⌘B`, `⌘I`, `⌘U`, anything in the editor-only
range) only fire when the editor pane has focus.

## What NOT to add

- A workflow runner (Arasul has it; the TUI shells out to it via `/compile`, `/verify`, `/stats`).
- A direct API client (subscription-only).
- Host-side persistent state (`memory/` on the SSD only).
- A second binary at `bin/myhub-tui` — that path is the bash launcher, not a Go binary. The Go TUI (`myhub-cli/cmd/myhub-tui`) is dead code (Phase 7.1).
