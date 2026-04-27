---
name: plan
description: Create a new plan in docs/plans/YYYY-MM-DD-slug.md from the canonical Arasul plan template. Use when the user says "let's make a plan", "plan X", "scaffold a plan", or "/plan". Use AskUserQuestion to collect goal, scope, and phases. Always for non-trivial multi-step work; the user prefers planning before doing.
---

# /plan — scaffold a new plan

Use this skill when the user wants to start a non-trivial piece of work and you (or they) want to capture it as a plan first.

## Workflow

1. **Interview** — call `AskUserQuestion` with up to 4 questions:
   - **Goal in one sentence?** (free-form via "Other")
   - **Scope** — multi-select from: arasul-app · myhub-tui · content/ · tooling/.boot/.github · docs/ · cross-cutting
   - **How many phases?** — 1, 2–3, 4–5, 6+
   - **Anything we are explicitly NOT doing?** — short text via "Other"

2. **Slugify** — `<YYYY-MM-DD>-<kebab-slug-from-goal>.md` (max 60 chars, no special chars). Use today's date from the auto-memory injection. If the file already exists, append `-2`.

3. **Write** the plan to `docs/plans/<filename>` using this template (fill the bracketed placeholders from the interview answers; leave `[ ]` checkboxes unchecked, leave Risks empty for the user to fill).

4. **Confirm** to the user with: filename, what was filled in, and the suggestion to run `/plan-progress` after each completed step.

## Template

```markdown
---
name: <slug-without-date>
status: draft
created: <YYYY-MM-DD>
last_touched: <YYYY-MM-DD>
owner: Kolja
related: []
---

## Goal

<one sentence from interview>

## Context

- Why now: <to be filled>
- What we know: <to be filled>
- What we're not doing: <from interview question 4>

## Phases

### Phase 1 — <name>
- [ ] Step 1.1
- [ ] Step 1.2

### Phase 2 — <name>
- [ ] Step 2.1

<one Phase block per phase from interview question 3>

## Risks / Open Questions

- ?

## Changelog

- <YYYY-MM-DD>  created
```

## Notes

- Don't fill in Phases content beyond placeholders unless the user gave specifics. Empty `[ ]` is fine; we want them to flesh it out interactively.
- Plans go in `docs/plans/`, NOT `content/notes/` (notes are for capture-as-you-think; plans are for structured work).
- For project-scoped plans (a plan that lives entirely inside one `content/projects/<slug>/`), write to `content/projects/<slug>/plans/<filename>` instead — same template.
- After writing, link the new plan from any related plan's `related:` frontmatter array (suggest it; don't auto-modify other files unless user agrees).
