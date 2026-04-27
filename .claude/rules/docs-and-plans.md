---
name: docs-and-plans rules
paths:
  - "docs/**"
---

# docs/ — product docs, plans, vision rules

Loaded only when editing under `docs/`.

## Layout

- `docs/vision/` — three short living docs (mission, target audience, product pillars). Update in place, bump `last_touched`. ~30–60 lines each. Don't grow.
- `docs/plans/` — every non-trivial work item starts here. Filename: `YYYY-MM-DD-slug.md`. Created via `/plan`, updated via `/plan-progress`. Plans older than 30 days with `status: done` move to `docs/plans/archive/`.
- `docs/archive/` — superseded planning docs. Read-only reference. Don't update; if a doc here needs to evolve, write a new one in the live area and link back.
- `docs/<topic>.md` — the canonical specs (locked / frozen status in frontmatter): `arasul-plan.md`, `arasul-design-spec.md`, `arasul-api-spec.md`, `arasul-execution.md`, `vision-v3-ai-workspace.md`, `vault-decision.md`, `release-process.md`, `beta-program.md`, `launch-checklist.md`, `sku-a-logistics.md`, `brand-migration-plan.md`, `brand-tm-check.md`, `ultimate-polish-plan-v2.md`, `authoring.md`, `design-moodboard.md`.

## Plan template (every plan must follow)

```markdown
---
name: <slug>
status: draft | in_progress | done | archived
created: YYYY-MM-DD
last_touched: YYYY-MM-DD
owner: <person>
related: [<other-plan-slugs>]
---

## Goal
1–2 sentences.

## Context
- Why now
- What we know
- What we're not doing

## Phases
### Phase 1 — <name>
- [ ] Step 1.1
- [ ] Step 1.2
- [x] Step 1.3 — done YYYY-MM-DD

### Phase 2 — <name>
- [ ] …

## Risks / Open Questions
- ?

## Changelog
- YYYY-MM-DD  created
- YYYY-MM-DD  Phase 1.3 done
```

The `/plan` skill scaffolds this; `/plan-progress` updates checkboxes + last_touched + Changelog + status (auto-flips to `done` when all checkboxes are checked).

## When to start a plan vs. just do the work

Make a plan when:
- It will take more than ~3 file edits.
- It crosses subsystems (e.g. arasul-app + content + tooling).
- It has reversibility concerns (changes to tooling, release, vault, OAuth flow).
- The user said "let's plan X first".

Skip the plan when:
- It's a one-line fix.
- It's a typo / formatting / lint cleanup.
- It's unblocking a CI failure.

## Doc status frontmatter (for canonical specs)

```yaml
---
name: <doc>
status: draft | locked | frozen | superseded
locked: YYYY-MM-DD       # if status >= locked
superseded_by: <other-doc>  # if superseded
last_touched: YYYY-MM-DD
---
```

`locked` = source of truth, change requires explicit unlock.
`frozen` = like locked but stronger (e.g. API spec contract).
`superseded` = move to `docs/archive/` next chance you get.

## Adding a new spec doc

1. Decide if it's a plan (→ `docs/plans/`) or a spec (→ `docs/`).
2. If a spec: include frontmatter with `status: draft` initially. Promote to `locked` only after explicit user sign-off.
3. Cross-link from `docs/arasul-plan.md` if it's an arasul concern.
4. Don't repeat content that's already in another locked doc — link.

## Anti-patterns

- Don't fork an existing locked doc (`ultimate-polish-plan.md` → `ultimate-polish-plan-v2.md` was a one-time mistake; archive the v1 instead).
- Don't write a "thinking out loud" doc into `docs/`. Use `content/notes/YYYY-MM-DD-*.md` for that — it's the right layer.
- Don't write more than one "vision" doc. Three short ones in `docs/vision/` is the cap.
- Don't link-rot: when archiving a doc, leave a one-line stub at the old path with `→ moved to docs/archive/<file>` for 30 days, then delete.
