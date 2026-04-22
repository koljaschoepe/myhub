# wiki/people/ — one article per recurring person

Compiled from `content/communication/` + `content/notes/` + project READMEs
by the `compiler` agent. One file per person, filename `<first-last>.md`.

## Article format

```markdown
---
name: First Last
since: 2023-04-12            # first appearance in the sources
last_mention: 2026-04-18     # most recent referenced source
aliases: [Nickname, Handle]
---

# First Last

## Relationship
One short paragraph: how you know them, current rhythm, context.

## Shared projects
- [[projekt-ara]] — role, timeline
- [[thesis]] — role, timeline

## Open threads
- Discussing X since 2026-03-12 [source: communication/slack-2026-03-12.md]
- Agreed on Y on 2026-02-02 [source: ...]

## Timeline
- 2026-04-18 — short summary [source: ...]
- 2026-04-02 — short summary [source: ...]
- 2026-03-15 — short summary [source: ...]

## Context notes
Longer-form observations that don't fit the timeline.
```

## Rules for the compiler

- **Merge nicknames/handles into the main article.** Don't create duplicates.
- **Never speculate.** If the source doesn't say X, don't claim X.
- **Every non-header paragraph cites a source.**
- **Redact secrets** (phone numbers, addresses) that accidentally appear.
- **Archive** when the person hasn't appeared in any source for > 12 months.
