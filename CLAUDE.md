# Arasul / myhub — repo guide

@AGENTS.md

This file is loaded by Claude Code on every session in this repo.
Keep it short — `.claude/rules/*.md` carry the per-subsystem detail (lazy-loaded by `paths:`).

## What this repo is

Two products on one portable SSD:
1. **Arasul** (`arasul-app/`) — Tauri 2 desktop app, Rust + React. Replaces myhub-tui as the primary UX.
2. **myhub-tui** (`myhub-tui/`) — Python TUI. Stays as standalone SSH/headless mode and as the right-pane TUI inside Arasul (mounted via `bin/arasul-tui-pane`).

Both share `content/` (Karpathy LLM Wiki + projects), `tooling/` (SSD imaging + runtime installers), `.boot/` (mount-time launcher), and `.claude/` (this configuration).

## Where context lives

- **Mission, audience, principles** → `docs/vision/` (3 short docs, kept current).
- **Active and past plans** → `docs/plans/YYYY-MM-DD-slug.md`. Always work from a plan; create one with `/plan`, update with `/plan-progress`.
- **Subsystem rules** → `.claude/rules/<subsystem>.md` (auto-loaded by `paths:` frontmatter — don't read them eagerly).
- **Product specs** → `docs/arasul-plan.md`, `docs/vision-v3-ai-workspace.md`, `docs/arasul-execution.md`. Locked, canonical.
- **Knowledge base** → `content/` (raw notes + projects), compiled into `content/wiki/` by the `compiler` agent.
- **Two `memory/` dirs (intentional)** — `/memory/` is host/TUI state (projects.yaml, config.toml, MEMORY.md auto-memory pointer, per-project state, `bin/myhub compile` state). `/content/memory/` is Karpathy wiki-compiler state (last_compile timestamp + session logs). Both gitignored. Don't merge them.

## Hard rules (apply everywhere)

1. **No API SDK imports in default code paths.** No `import anthropic`, `from anthropic`, `import openai`, `from openai`, `@anthropic-ai/sdk` anywhere unless the file carries the marker `// arasul:allow-api-sdk` with a justification. Enforced by `.claude/hooks/block-api-imports.sh`.
2. **AI calls go through `claude` subprocess.** Either interactive PTY or `claude -p` headless. The user's subscription pays. Never harvest, persist, or relay the OAuth token.
3. **No host writes** outside `~/Library/LaunchAgents/com.myhub.mount.plist` (one file, one Mac, ever). Everything else lives on the SSD.
4. **English-only** in code, comments, UI strings, and docs (per project decision 2026-04-24).
5. **AskUserQuestion for clarifications.** Never plain-text "what do you want?" — always structured multi-choice (per user preference, see `~/.claude/memory`).

## Sub-project entrypoints

| Path | What | When working here |
|---|---|---|
| `arasul-app/` | Tauri desktop app | `.claude/rules/arasul-app.md` auto-loads |
| `myhub-tui/` | Python TUI | `.claude/rules/myhub-tui.md` auto-loads |
| `content/` | Knowledge base + projects | `.claude/rules/content-wiki.md` auto-loads |
| `docs/` | Product docs + plans | `.claude/rules/docs-and-plans.md` auto-loads |
| `tooling/`, `.boot/`, `.github/` | Build, install, release | `.claude/rules/tooling.md` auto-loads |

## Dates

Today's date and recent dates come from the auto memory injection. When writing files, use ISO 8601 (`YYYY-MM-DD`).

## When the user starts a task

1. If it's non-trivial, propose making a plan with `/plan` first. Plans live in `docs/plans/`.
2. If a relevant plan already exists, work from it and use `/plan-progress` to check off steps and bump the changelog as you go.
3. If the user signals a one-off question or a tiny fix, just do it — don't ceremony.

<!-- Maintainer notes (stripped from prompt): keep this file under 100 lines. Per-subsystem detail belongs in .claude/rules/. -->
