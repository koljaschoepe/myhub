# wiki/timeline/ — weekly and monthly chronological digests

Compressed summaries of activity across `content/`. Weekly files live at the
root of this directory; monthly and quarterly rollups live in subdirectories
as they grow.

## File naming

- Weekly: `YYYY-Www.md` (ISO week, e.g., `2026-W17.md`)
- Monthly: `monthly/YYYY-MM.md`
- Quarterly (compiler rolls up after 12 weeks): `quarterly/YYYY-Qn.md`

## Article format (weekly)

```markdown
---
week: 2026-W17
range: 2026-04-20..2026-04-26
files_changed: 27
commits: 14
people_mentioned: [[alex-mueller]], [[jamie-smith]]
projects_touched: [[projekt-ara]], [[myhub]]
---

# Week 17 / 2026

## Highlights
- 2-4 lines: what defined this week.

## Per-project
- **[[myhub]]** — Phase 1 MVP completed, Phase 2 started. 8 commits. [source: git]
- **[[projekt-ara]]** — 3 commits; blocked on decision X.

## Conversations
- [[alex-mueller]] — renewed thread about Y [source: communication/slack-...]

## Decisions
- 2026-04-22 — chose TUI-first over Claude-direct [source: SPEC.md v2]

## Open threads (ending the week)
- [ ] ...
```

## Rules for the compiler

- **Compress, don't duplicate.** Timeline articles summarize; they don't
  repeat the full content of the source files.
- **Highlights come from: commit messages, memory updates, file creations.
  Not file counts alone.**
- **Promote weekly → monthly → quarterly** as weeks age past 8 / 24 weeks.
  Older weeklies can be archived once rolled up.
- **Every entry links to a wiki article** (person or project) plus a raw
  source. The timeline is a backlink-heavy index, not a standalone story.
