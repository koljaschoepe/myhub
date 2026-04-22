# Authoring `CLAUDE.md` — the Context Layer

Every directory on the SSD that matters has a `CLAUDE.md` file. They're
the reason Claude Code understands your drive without being told every
session. This doc explains how to write them well.

## Why they exist

Claude Code auto-loads `CLAUDE.md` files it finds in and above its working
directory. With the myhub launcher's cwd set to `content/projects/<slug>`,
Claude sees:

1. `content/projects/<slug>/CLAUDE.md` — this project's specifics
2. `content/projects/CLAUDE.md` — conventions for all projects
3. `content/CLAUDE.md` — the root map of the whole drive
4. `memory/MEMORY.md` — the user's learned preferences and facts

That stack is your context. Everything else is read on demand.

## The shape of a good `CLAUDE.md`

An [llms.txt](https://llmstxt.org/)-style document: human-readable, also
machine-navigable. The agent should be able to pick it up cold and know
where to go next.

```markdown
# <scope name> — one-line framing

## What this directory is
2–4 lines. What lives here, who it's for, what it's not.

## Conventions
- File names use kebab-case.
- Dates are ISO-8601 (YYYY-MM-DD).
- Links between wiki articles: [[slug]]
- From wiki back to raw: [source: relative/path.md](relative/path.md)

## How to navigate
1. Start with <this subdirectory / file>.
2. Follow links to <other place>.
3. For questions about X, the answer lives in Y.

## Rules for agents reading this
- Never write to <these paths>.
- Cite sources when quoting.
- Prefer wiki-level synthesis over re-reading raw notes.
```

## The three rings

### Root — `content/CLAUDE.md`

The map of the whole drive. Short. Lists the four top-level categories
(`notes`, `projects`, `communication`, `wiki`) plus any user-specific
ones. Defines global conventions (naming, link styles, citation rules).

**What NOT to put here:** project-specific details, personal preferences
(those belong in `memory/`), anything that changes week to week.

### Domain — `content/<domain>/CLAUDE.md`

Scope: a category of content (notes, projects, communication, etc.).
Hand-written by you, rarely by the compiler. Explains:
- The structure of files under this directory.
- Any domain-specific rules (privacy expectations for communication,
  naming conventions for notes, etc.).
- How the compiler should treat this content (read-only,
  summary-only, etc.).

See the templates shipped under `content/notes/CLAUDE.md`,
`content/projects/CLAUDE.md`, `content/communication/CLAUDE.md`,
`content/wiki/CLAUDE.md` for exemplars.

### Project — `content/projects/<slug>/CLAUDE.md`

Required for every active project (the TUI scans for this file to list
the project). Minimum viable version:

```markdown
# <project name>

## What it is
One paragraph: problem, stakeholders, current state.

## Current status
2–5 bullets: what's done, what's next, what's blocked.

## Key constraints
Anything Claude should know before writing code or making suggestions.
For example: "Python 3.11 only, no async. We use pytest, not unittest."

## Context
Background info Claude won't figure out from the repo: history, why X
was chosen over Y, lessons from earlier attempts.
```

Optional but useful: `.myhub-project.toml` alongside CLAUDE.md with
display name, icon, and per-project agent overrides. See
`content/projects/CLAUDE.md` for the schema.

## Patterns worth stealing

- **Lead with what matters.** First 200 words get the most attention.
- **Use bullet lists** for repeated structures (rules, files, steps).
  Markdown's hierarchy is Claude's outline.
- **Link generously.** `[wiki/concepts/foo.md]` pulls in the concept
  article automatically when Claude needs deeper context.
- **State the anti-patterns.** "Never rewrite X. Don't add Y without Z."
  Explicit rules beat implicit preferences.
- **Keep it living.** Dated notes at the bottom (`## 2026-04-22 — decided Z
  instead of W`) turn CLAUDE.md into a cheap changelog.

## Anti-patterns to avoid

- **Too long.** If it's > 300 lines, split into the wiki or
  `memory/patterns/`. CLAUDE.md is a map, not the atlas.
- **Too generic.** "Follow best practices" is worthless. Name the
  practice, pointer to an example.
- **Stale.** Every `CLAUDE.md` older than six months without an edit is a
  lie. Either delete or update. `/reflect` at session-end helps.
- **Duplicates memory.** If a fact lives in `memory/user/*.md`, don't
  also stuff it in `CLAUDE.md` — it'll drift.
- **Secrets.** `CLAUDE.md` is readable by anyone with the drive. Keep
  API keys out (they go in `memory/` under mode 0600 or in a separate
  secrets file that's `.gitignore`'d).

## When to update

- After `/setup` (name + prefs land in `content/CLAUDE.md`).
- After a significant decision in a project (add a dated line to the
  project's CLAUDE.md).
- After the compiler surfaces a new domain convention (e.g. "all
  timeline entries should be dated" — promote it to the domain
  CLAUDE.md).
- When you catch Claude making the same mistake twice — that's a
  missing rule in a CLAUDE.md.

## Quick smell test

Before closing an edit, ask: if a fresh agent picks this up cold,
will they know:

- [ ] What this directory is for?
- [ ] What conventions govern content here?
- [ ] Where to find related info (via links)?
- [ ] What NOT to do?

If any answer is "no", tighten that section.
