# wiki/ — compiled knowledge (Karpathy LLM Wiki pattern)

Auto-maintained by the `compiler` agent. The wiki is the synthesis of the raw
content on this SSD, written as interlinked markdown. **Human-readable by
design; do not edit manually unless you want your edits preserved.**

## Categories

- `people/` — one article per recurring person: relationships, shared projects, timeline.
- `projects/` — one article per project: status, decisions, open threads.
- `concepts/` — recurring ideas, mental models, recipes, patterns.
- `timeline/` — weekly and monthly digests, chronological.
- `_archive/` — articles whose source files have been deleted or gone stale.

## Linking conventions

- Between wiki articles: `[[wikilinks]]` with the target slug. Example: `[[projekt-ara]]`.
- From wiki back to raw source: `[source: notes/2025-07-12-idea.md](…)` — always a relative path.
- Every factual claim cites at least one source.

## When Claude answers a question

1. Start here — this map + the article index.
2. Read the specific wiki article.
3. If the wiki lacks specifics, follow `[source: …]` backrefs to raw content.
4. Cite both the wiki article and the ultimate raw source in your answer.

## Rebuild

Full rebuild: `/compile --full` (destructive — overwrites wiki, raw is untouched).
Incremental: `/compile` or happens automatically on `SessionEnd`.
