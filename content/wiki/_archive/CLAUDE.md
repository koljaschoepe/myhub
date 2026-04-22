# wiki/_archive/ — articles whose sources went stale or were deleted

When a wiki article's underlying source files are deleted, or no longer
appear in any raw source for the archive threshold (people: 12 months,
projects: 6 months, concepts: never — concepts don't age), the compiler
moves them here instead of deleting them outright.

## Why keep archives

- **History is cheap.** A moved article is a `git mv` — it stays in the
  history either way.
- **Re-activation is easy.** If a person resurfaces after a year, the
  compiler un-archives (`git mv _archive/ back to category`) rather than
  rebuilding from scratch.
- **Compiler can learn from its mistakes.** If you manually move an
  article back from `_archive/`, that's a signal to the compiler next
  pass: this topic isn't as stale as its last-mention date suggested.

## Structure mirrors the categories

```
_archive/
├── people/     # archived person articles
├── projects/   # archived project articles
├── concepts/   # rarely used — concepts don't age out
└── timeline/   # rolled-up weekly digests past the retention window
```

## Rules for the compiler

- **Never delete.** Only move.
- **Always update the article's frontmatter** with an `archived_at` date.
- **Remove all [[wikilinks]] TO this archived article from other active
  articles** (orphan them explicitly, don't silently break links). Add a
  note in the orphaning articles: `was [[slug]], archived 2026-04-22`.
- **On revival** (source reappears), restore the article to its category,
  update `last_mention`, remove `archived_at`, and rewire backlinks.
