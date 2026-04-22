# wiki/concepts/ — recurring ideas, mental models, recipes, patterns

One article per concept, mental model, or recurring pattern the user
references more than once in their notes. Not facts about specific projects
or people — those go in `wiki/projects/` and `wiki/people/`.

Filename: `<kebab-case-slug>.md`.

## Article format

```markdown
---
name: Retrieval-Augmented Generation
aliases: [RAG]
first_seen: 2025-07-03
last_mention: 2026-04-18
appearances: 12          # how many raw sources reference it
related_people: [[andrej-karpathy]]
related_projects: [[projekt-ara]]
---

# Retrieval-Augmented Generation

## In one sentence
Augment an LLM's context with external data retrieved at query time, instead
of relying solely on what the model memorized during training.

## How the user uses it
User's take, recurring framings, preferred setups. Based on their own notes.

## When they've applied it
- [[projekt-ara]] — attempt at vector search over notes. [source: ...]
- [[projekt-bohr]] — rejected in favor of wiki navigation. [source: ...]

## Related concepts
- [[llm-wiki-pattern]] — alternative approach, same problem
- [[embedding-models]] — prerequisite

## Sources
- notes/2025-07-03-rag-intro.md
- notes/2026-01-14-karpathy-thread.md
- ...
```

## Rules for the compiler

- **Create a concept article only when the idea appears ≥ 3 times** across
  different raw files. Single mentions live fine in the source; promoting
  early creates cruft.
- **Concepts are synthesis** — don't just quote. The article should read as
  if the user wrote it themselves.
- **Related concepts is a graph**: use [[wikilinks]] liberally, both up to
  parent ideas and down to instances.
