# content/ — Karpathy LLM Wiki rules

This file scopes Claude's behavior **inside `content/`**. The repo's overall
orientation lives in the SSD-root `/CLAUDE.md` and `/AGENTS.md`; product
mission/audience/pillars in `/docs/vision/`; active work plans in
`/docs/plans/YYYY-MM-DD-slug.md`. Subsystem-scoped rules (myhub-tui,
arasul-app, tooling, docs) live in `/.claude/rules/<subsystem>.md` and load
lazily by `paths:` frontmatter — don't read them eagerly.

This is an [llms.txt](https://llmstxt.org/)-style map: human-readable, also
machine-navigable. When in doubt, follow the links.

## Owner

Kolja

## Top-level categories under content/

- **`notes/`** — raw personal notes (markdown, text). Chronological, unstructured. See `notes/CLAUDE.md`.
- **`projects/`** — one subdirectory per project. Surfaced in the myhub TUI. See `projects/CLAUDE.md`.
- **`communication/`** — email, chat, messaging archives. Read-only for agents. See `communication/CLAUDE.md`.
- **`wiki/`** — compiled knowledge (Karpathy LLM Wiki pattern). Auto-maintained by the `compiler` agent. See `wiki/CLAUDE.md`. Do not edit manually unless you want your edits preserved through the next compile.
- **`memory/`** — runtime state for the wiki compiler (e.g. `compile-state.json` with `last_compile` timestamp, `sessions/` logs). Untracked by git. **Do not confuse with the SSD-root `/memory/`** which is host/TUI state (projects.yaml, MEMORY.md auto-memory pointer, per-project `arasul/` + `myhub_tui/` dirs, `bin/myhub compile` state). Two dirs, two pipelines, on purpose.

## Conventions

- Every directory that needs context has its own `CLAUDE.md`.
- File names: `kebab-case.md` unless a tool imposes otherwise.
- Dates: ISO 8601 (`YYYY-MM-DD`) in filenames and content.
- Cross-references: `[[wikilinks]]` between wiki articles; `[source: relative/path.md](relative/path.md)` from wiki back to raw.

## When asked a question

Navigate, don't guess:

1. Check `wiki/` first (it's the synthesis layer).
2. If wiki doesn't answer, Grep raw content directly.
3. Always cite with a relative path when referencing a file.

## SSD-root source files (outside content/)

Some raw source material lives at the SSD root, not under `content/`. When
the compiler or any agent needs to reference these, use absolute paths or
paths relative to the SSD root (`/Users/koljaschope/Documents/ssd/`):

- **`/CLAUDE.md` + `/AGENTS.md`** — repo orientation. Loaded by Claude Code on every session.
- **`docs/`** — product specs, plans, vision. Canonical pair for the product is `docs/arasul-plan.md` (LOCKED) + `docs/vision-v3-ai-workspace.md` (LOCKED). All non-trivial work plans live under `docs/plans/YYYY-MM-DD-slug.md`. Product mission/audience/pillars in `docs/vision/`. Superseded docs in `docs/archive/`.
- **`arasul-app/`** — Tauri 2 GUI source (Rust + React). The active GUI codebase for the Arasul product.
- **`myhub-tui/`** — Python TUI (`myhub_tui/`). Standalone for SSH/headless and embedded inside Arasul via `bin/arasul-tui-pane`.
- **`.claude/rules/`** — subsystem-scoped rule files (`myhub-tui.md`, `arasul-app.md`, `content-wiki.md`, `tooling.md`, `docs-and-plans.md`). Auto-loaded by `paths:` frontmatter when Claude touches matching files. Don't read them eagerly.
- **`CHANGELOG.md`** — Arasul changelog at the SSD root.
- **`landing/`** — landing page source.
- **`tooling/`** — SSD imaging and Rust install scripts.
- **`bin/`** — compiled binaries (myhub CLI, arasul-tui-pane, uv). The proprietary `claude` binary is **not** bundled (license); the Onboarding wizard installs it via Anthropic's official curl-installer.

The compiler agent should treat `docs/` as a raw source directory on par
with `content/notes/`, `content/projects/`, and `content/communication/`
for the purpose of building wiki articles about the Arasul project.

## Not on this drive

- Source code for open-source tools the user consumes (clone on demand).
- Binary media files > 100 MB (keep elsewhere; reference by URL or hash).
- Work-issued data (corporate IP stays on corporate systems).
