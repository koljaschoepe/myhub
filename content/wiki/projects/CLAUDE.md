# wiki/projects/ — one article per project

Compiled from `content/projects/<project>/` (code, notes, CLAUDE.md) plus
cross-references in `content/notes/` and `content/communication/`. One file
per project, filename `<project-slug>.md`.

## Article format

```markdown
---
name: project-slug
display_name: "Project Ara"
status: active | paused | shipped | abandoned
started: 2026-02-14
last_activity: 2026-04-22
related_people: [[alex-mueller]], [[jamie-smith]]
---

# Project Ara

## What it is
One paragraph: the elevator pitch. What problem it solves, for whom.

## Current status
2-4 lines: what state the project is in, what's next.

## Key decisions
- 2026-04-12 — Chose X over Y because ... [source: notes/2026-04-12-decision.md]
- 2026-03-05 — ...

## Open threads
- [ ] Task / question / unresolved thing [source: ...]
- [ ] ...

## Timeline
- 2026-04-22 — 4 commits, new feature flag [source: git log]
- 2026-04-18 — Discussed with [[alex-mueller]] [source: communication/...]
- ...

## Links
- Repo: <url>
- Related: [[projekt-bohr]], [[concept-retrieval-augmented-generation]]
```

## Rules for the compiler

- **Status inferred from git + source files** (recent commits = active).
- **Key decisions** must link to the raw note/message that made them.
- **Open threads** should be actionable (a question, a stuck issue, a TODO).
- **Timeline is compressed** — group by day/week, don't duplicate what the
  wiki article's `related_people` already implies.
- **Archive** when status=abandoned AND no activity for > 6 months.
