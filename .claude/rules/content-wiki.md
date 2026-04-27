---
name: content-wiki rules
paths:
  - "content/**"
---

# content/ — Karpathy LLM Wiki rules

Loaded only when editing under `content/`.

Full conventions are in `content/CLAUDE.md`. This file adds the rules that matter when *editing* content.

## Three layers

1. **Raw** — `content/notes/`, `content/projects/`, `content/communication/`. Append-only from the user; agents read but don't rewrite.
2. **Wiki** — `content/wiki/`. Auto-maintained by the `compiler` agent (`.claude/agents/compiler.md`). `wiki/people/`, `wiki/projects/`, `wiki/concepts/`, `wiki/timeline/`. **Don't hand-edit wiki articles** — your edits get overwritten on the next `/compile`. If you want a permanent edit, modify the raw source instead and recompile.
3. **State** — `content/memory/compile-state.json` + session logs. Untracked. The compiler reads `last_compile` from here.

## When asked a question about content

1. Check `content/wiki/index.md` first (synthesis layer; create it if missing per Phase 8.3 of master plan).
2. If wiki doesn't answer, `Grep` raw content directly.
3. Always cite with a relative path: `[source: content/notes/2026-04-22-karpathy-wiki-pattern.md](…)`.

## File conventions

- **Naming:** `kebab-case.md`. Notes use `YYYY-MM-DD-slug.md` (ISO date prefix).
- **Cross-refs:** `[[wikilinks]]` between wiki articles; `[source: relative/path.md]` from wiki back to raw.
- **Block-level HTML comments** (`<!-- … -->`) are stripped before context injection — free maintainer notes.

## Adding a new project

`content/projects/<slug>/` with at minimum:
- `CLAUDE.md` — what the project is, who's on it, current status, where its files live (do NOT make this a 4-line stub like `thesis/` is — write at least 30 lines of real context).
- `.myhub-project.toml` (optional, surfaces in TUI).

The `/new` TUI command scaffolds these. If you scaffold by hand, follow `content/projects/koljaschoepe-scientific-writing/CLAUDE.md` as the gold standard.

## Compile pipeline

- Triggered by `/compile` slash command, `SessionEnd` hook, or external fswatch.
- Incremental by default (since `last_compile`); `/compile --full` rebuilds.
- The `compiler` agent (Read/Write/Edit/Grep/Glob/Bash) writes to `content/wiki/` and updates `content/memory/compile-state.json`.
- **Don't manually invoke the compiler agent in code paths** — go through `/compile` so the state file gets updated.

## Karpathy pattern essentials (per Phase 8.3)

`wiki/index.md` is the catalog (one-line summaries, refreshed every ingest).
`wiki/log.md` is append-only with date-prefixed entries (`## [YYYY-MM-DD] ingest | <Title>`).
Three workflows: **ingest** (read → summarize → update index → cross-link → log), **query** (read index → drill in → cite), **lint** (find contradictions, stale claims, orphans).

If `wiki/index.md` or `wiki/log.md` don't exist yet, create them as part of the next compile.

## What NOT to do

- Don't commit `content/notes/**` (user data; gitignored except `CLAUDE.md` templates).
- Don't commit `content/wiki/**` articles (re-derivable; gitignored except category `CLAUDE.md`).
- Don't commit `content/memory/**` (untracked runtime state).
- Don't write into `content/communication/` programmatically — that's user-imported archives only (read-only for agents).
