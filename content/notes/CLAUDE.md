# notes/ — raw personal notes

Unstructured, chronological. This directory is the substrate from which the
wiki is compiled.

## Conventions

- **One file per topic** (or per day, both are fine).
- Markdown preferred; plain text accepted.
- Filenames: `YYYY-MM-DD-<slug>.md` for dated notes; free-form for topical ones.
- No enforced folder hierarchy — the `compiler` agent categorizes from content.

## How Claude should navigate

- Read the specific file the user references (by path or `grep`).
- Use `Grep` for keyword search across the full notes corpus.
- Fall back to the compiled `wiki/` when a synthesis is needed.

## Never

- Never let an agent modify files here. Raw notes are ground truth.
- Never pre-summarize — the compiler does that, in `wiki/`.
