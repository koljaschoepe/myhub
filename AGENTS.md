# AGENTS.md

Portable map for AI coding agents (Claude Code, Codex, Cursor, Jules, Aider, …).
Per the [agents.md](https://agents.md) convention. Claude Code reads this via `@AGENTS.md` in `CLAUDE.md`.

## Project

Arasul is a portable AI workspace on a USB-C SSD: native desktop app (Tauri 2, Rust + React) plus a Python TUI fallback, both running off the drive. Default AI path = the user's own Claude Code subscription, spawned as a subprocess. No API costs, no proxy, no telemetry.

Read `docs/vision/01-mission.md` for the one-paragraph "why".

## Repo layout

- `arasul-app/` — Tauri 2 desktop app (Rust backend in `src-tauri/`, React/Vite frontend in `src/`). The primary user-facing product.
- `myhub-tui/` — Python 3.13 TUI (`prompt_toolkit` + `rich`). Standalone for SSH/headless; also embedded in the Arasul right pane.
- `content/` — Karpathy-style knowledge base. Raw under `notes/`, `projects/`, `communication/`; compiled into `wiki/` by the `compiler` agent.
- `docs/` — Product specs, plans (`docs/plans/`), vision (`docs/vision/`).
- `tooling/`, `.boot/`, `.github/` — Build, install, release.
- `.claude/` — Claude Code configuration: agents, skills, hooks, rules, settings.

## Build & test

```bash
# Tauri app (from arasul-app/)
pnpm install
pnpm tauri dev          # dev build with hot-reload
pnpm tauri build        # production bundle
cd src-tauri && cargo test

# Python TUI (from repo root)
bin/myhub-tui                                # run
cd myhub-tui && PYTHONPATH=. ../runtime/python/bin/python3 -m pytest tests/

# Maintenance CLI (Go)
cd myhub-cli && go test ./...
```

## Conventions

- **Language:** English only — code, comments, UI strings, docs. Decided 2026-04-24.
- **Dates:** ISO 8601 (`YYYY-MM-DD`) in filenames and content.
- **Naming:** `kebab-case.md` for docs.
- **Tauri commands:** `#[tauri::command]` in topic-grouped modules (`vault.rs`, `claude.rs`, `workflow.rs`, …); register in `lib.rs`.
- **TUI commands:** Handler `cmd_<name>(state, args) -> CommandResult` in `myhub_tui/commands/<name>.py`; register in `core/router.py:build_registry()`.

## Hard rules

1. **No Anthropic / OpenAI SDK imports in default code paths.** AI is invoked by spawning the official `claude` CLI as a subprocess (interactive PTY or `claude -p` headless). The user's subscription pays. A `PreToolUse` hook blocks `import anthropic`, `from anthropic`, `import openai`, `from openai`, `@anthropic-ai/sdk` unless the file carries `// arasul:allow-api-sdk` with a justification.
2. **Never read, persist, relay, or log the user's Claude OAuth token.** Set `CLAUDE_CONFIG_DIR=$ARASUL_ROOT/.claude` and let the official CLI manage credentials.
3. **Never bundle the `claude` binary.** It is proprietary ("All rights reserved" in the upstream `LICENSE.md`). Onboarding orchestrates Anthropic's official `curl … | bash` installer; we don't redistribute.
4. **No host writes** beyond a single ~1 KB launchd / autostart entry. Everything else stays on the SSD.
5. **No telemetry, no analytics, no feature flags.** Per `docs/vision/03-product-pillars.md`.

## Plans

Non-trivial work starts with a plan in `docs/plans/YYYY-MM-DD-slug.md`. Template: frontmatter + Goal + Context + Phases (with `[ ]` checkboxes) + Risks + Changelog. Update progress as you go.

## Vision lives at

`docs/vision/01-mission.md`, `02-target-audience.md`, `03-product-pillars.md`. Three short living docs.
