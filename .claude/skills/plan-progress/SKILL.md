---
name: plan-progress
description: Update progress on a plan in docs/plans/. Mark steps as done, append a Changelog entry, bump last_touched, auto-flip status to done when all checkboxes are checked. Use when the user says "mark X done in the plan", "update the plan", "tick off Y", or "/plan-progress". Also use proactively after you finish work that completed a checkbox in the active plan.
---

# /plan-progress — update plan checkboxes and changelog

Use this skill when work just completed a step (or several) in an existing plan, OR when the user explicitly asks to update plan state.

## Workflow

1. **Find the plan** — if the user named it (`/plan-progress master-plan` or "the master plan"), Glob `docs/plans/*<slug>*.md` and `content/projects/*/plans/*<slug>*.md`. If ambiguous, AskUserQuestion with the candidates. If not named, list the most recently touched 3–5 plans (sort by frontmatter `last_touched`) and ask.

2. **Identify the steps to mark** — either:
   - The user named them ("Phase 2.3 and 2.4 are done"), OR
   - You just finished work that maps to specific checkboxes — propose them via AskUserQuestion before checking, never assume silently.

3. **Patch the file** with `Edit`:
   - Change `- [ ] Step X.Y` → `- [x] Step X.Y — done <YYYY-MM-DD>`
   - Bump frontmatter `last_touched: <YYYY-MM-DD>`
   - Append a Changelog entry: `- <YYYY-MM-DD>  Phase X.Y done` (or summary line for batches)
   - If ALL checkboxes in ALL Phases are now `[x]`, also flip frontmatter `status: in_progress` → `status: done` and append `- <YYYY-MM-DD>  plan completed` to Changelog.
   - If status was `draft` and any checkbox is now `[x]`, flip to `in_progress`.

4. **Confirm** to the user with: which steps were marked, new status if changed, and (if status flipped to `done`) suggest archiving via "ready to move this to docs/plans/archive/?".

## Today's date

Use today's date from the auto-memory injection (`# currentDate`). Never invent a date.

## Notes

- One Changelog line per `/plan-progress` invocation, even if multiple checkboxes were marked. Format: `- YYYY-MM-DD  <summary>` (e.g. `2026-04-27  Phase 3.1, 3.2 done`).
- Don't ever modify the Goal, Context, Risks, or Phase headings — those are user-owned content.
- Don't reorder or re-number steps. Checkboxes only.
- If a step needs to be added or removed, that's a plan amendment — ask the user first, then a separate Edit operation, NOT part of /plan-progress.
- Plans in `docs/plans/archive/` are read-only — refuse to update those.
