# myhub-tui (Python)

Terminal UI for myhub. Ported from the OpenAra UX pattern
(`prompt_toolkit` + `rich`, pending-handler wizards, command registry)
to the macOS-native SSD context.

## Status

v3 — Python port landed. 14 commands in 5 categories, 37 pytest tests,
first-run onboarding, wizard-based project create/delete,
exec-replace launches for `claude` and `lazygit`.

## How it runs

The bash launcher at `$MYHUB/bin/myhub-tui` sets up `PYTHONHOME` pointing
at the SSD-portable Python runtime (`$MYHUB/runtime/python/`) and execs
this package:

```
python3 -m myhub_tui.app
```

No host Python installation is needed — the runtime ships on the SSD.
Bootstrap with:

```
bash $MYHUB/tooling/install-python.sh
bash $MYHUB/tooling/install-uv.sh
$MYHUB/bin/uv pip install --python $MYHUB/runtime/python/bin/python3 \
    rich prompt-toolkit psutil PyYAML
```

## Commands (14 / 5 categories)

| Category | Names | Aliases |
|---|---|---|
| Projects | `open`, `new`, `info`, `delete`, `repos` | `o` `switch` `use`, `n` `create`, `i` `details`, `d` `remove`, `projects` `list` `ls` |
| AI | `claude`, `brief` | `c` `ai` |
| Git | `git`, `lazygit` | `pull` `push` `status` (resolve to `/git <sub>`), `g` `lg` |
| System | `compile`, `verify`, `stats` | `s` |
| Meta | `help`, `quit` | `?` `h`, `q` `exit` `bye` |

Plus a numeric `1..N` shortcut that opens the Nth project, and first-run
onboarding that arms a wizard asking for a name.

## Layout

```
myhub-tui/
├── pyproject.toml                    ← Python package meta, entry point
├── myhub_tui/
│   ├── app.py                        ← run() + dispatch loop + wizard routing
│   ├── core/
│   │   ├── theme.py                  ← palette, glyphs, logo gradient
│   │   ├── types.py                  ← CommandResult, PendingHandler
│   │   ├── state.py                  ← TuiState (root = $MYHUB_ROOT)
│   │   ├── registry.py               ← CommandSpec + natural-language resolve
│   │   ├── router.py                 ← build_registry + run_command
│   │   ├── projects.py               ← memory/projects.yaml + filesystem scan
│   │   ├── config.py                 ← memory/config.toml (TOML via tomllib)
│   │   ├── onboarding.py             ← first-run name wizard
│   │   └── ui/
│   │       ├── dashboard.py          ← logo, system box, project list, prompt
│   │       ├── output.py             ← tiers, print helpers, spinner
│   │       └── panels.py             ← _bar, print_panel, print_kv, print_step
│   └── commands/
│       ├── project.py                ← open, new (wizard), info, delete (wizard), repos
│       ├── ai.py                     ← claude (os.execvp + respawn marker)
│       ├── brief.py                  ← headless claude -p --agent briefer
│       ├── git.py                    ← pull/push/log/status subcommands
│       ├── lazygit.py                ← exec-replace to lazygit
│       ├── compile.py                ← shell out to bin/myhub compile
│       ├── verify.py                 ← shell out to bin/myhub verify
│       ├── stats.py                  ← shell out to bin/myhub stats
│       └── meta.py                   ← help, quit
└── tests/
    ├── conftest.py                   ← tmp_root + state fixtures
    ├── test_config.py                ← TOML round-trip, perms, self-heal (6)
    ├── test_onboarding.py            ← flow, re-prompt, persist (5)
    ├── test_projects.py              ← YAML round-trip, scan, merge (8)
    ├── test_registry.py              ← resolve exact/alias/prefix/fuzzy (14)
    └── test_state.py                 ← env priority, derived paths (4)
```

## Tests

```
cd myhub-tui
PYTHONPATH=. ../runtime/python/bin/python3 -m pytest tests/
# 37 passed in ~0.3s
```

## Why not fork OpenAra directly?

OpenAra targets Linux servers (Jetson/RPi detection, fail2ban, n8n
Docker, Tailscale, playwright). myhub targets macOS SSDs. ~60 % of
OpenAra is irrelevant here. We port the ~30 % that applies (UX
architecture, visual identity, project registry, wizard pattern) and
build myhub's own features (`brief`, `compile`, `verify`, `stats`)
natively. Both projects evolve independently.

## Launch model: exec-replace + respawn marker

When the user opens a project and runs `/claude`:

1. `commands/ai.py` writes `.boot/.respawn` — a sentinel file.
2. `app.py` calls `os.execvp("claude", ...)` — the Python process
   **becomes** Claude. The TTY is inherited cleanly.
3. User works in Claude.
4. Claude exits. Control returns to `launcher.sh` (parent of the TUI).
5. `launcher.sh` sees the respawn marker, removes it, restarts the TUI.
6. TUI reopens; the user lands back on the dashboard.

If `os.execvp` itself fails (e.g. missing claude binary), `app.py`
removes the marker so `launcher.sh` does not loop over a broken target.
If the TUI crashes in the first 3 seconds repeatedly (>5× in 10s),
`launcher.sh` aborts into a direct Claude fallback.
