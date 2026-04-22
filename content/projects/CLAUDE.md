# projects/ — one subdirectory per active project

Every subdirectory here is a project the myhub TUI surfaces in its project
list. The TUI scans this directory on every mount and lists each subdir that
has a `CLAUDE.md` or a `.myhub-project.toml`.

## Per-project conventions

A project subdir contains:

- `CLAUDE.md` — project-specific context (required for the TUI to list it).
- `.myhub-project.toml` — optional: display name, icon, accent color, custom agents, per-project config override.
- Whatever else the project is: code, notes, docs, assets.

## The `.myhub-project.toml` schema

    [project]
    display_name = "Project Ara"
    icon = "🤖"
    color = "#00d4ff"

    [agents]
    custom_config_dir = false   # if true, TUI sets CLAUDE_CONFIG_DIR per-project

All fields are optional. Missing fields fall back to defaults (dir name for
display_name, no icon, theme-default color, shared `.claude/` config).

## When Claude is launched in a project

The TUI sets two env vars before exec:

- `MYHUB_PROJECT=<slug>` — the directory name of the selected project.
- `MYHUB_ROOT=/Volumes/myhub` — SSD root (useful from hooks).

The `SessionStart` hook uses these to layer `memory/projects/<slug>/` memory
on top of the global memory index, so Claude sees project-scoped context
without polluting global memory.
