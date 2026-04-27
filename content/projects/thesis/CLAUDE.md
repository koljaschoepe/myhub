# Thesis

Kolja's thesis. Working title and topic land here once locked.

## Status

Pre-writing. The project directory exists so the TUI surfaces it; substantive
content arrives over time. If this stub is still here in a month, the project
should be deleted via the TUI's `/delete` command — no half-alive scaffolds.

## Structure (target — fill as the work progresses)

- `outline.md` — chapter-level structure, current revision count.
- `references/` — BibTeX, PDFs of cited papers, notes per source.
- `drafts/` — chapter drafts (e.g. `01-introduction.md`, `02-methods.md`).
- `figures/` — exported plots, diagrams, source files.
- `submission/` — final compiled PDF + supplementary materials.

## Conventions

- Citations: BibTeX, IDs `LastnameYYYY-keyword` (e.g. `Karpathy2026-llmwiki`).
- Drafts: ATX headers (`#`, `##`), no setext.
- Filenames: `kebab-case.md`, ISO dates in changelogs.
- Chapter source-of-truth lives in `drafts/`; the compiled artifact in
  `submission/` is regenerated, not hand-edited.

## When Claude is launched here

- Brief from `wiki/projects/thesis.md` (compiled by `compiler` agent).
- Read related notes in `content/notes/` matching `thesis|dissertation|<topic>`.
- Don't write to `references/` files programmatically — those are imported
  archives. Append to `references/notes-on-<source>.md` instead if reading
  notes need to live near the source.

## Done definition

`submission/thesis-final.pdf` exists and matches the institute's required
template. Plus a tagged commit in this directory's git history.
