# myhub — content root map

Top-level map of everything on this SSD. Claude Code auto-loads this file at
every session start; use it as the entry point when navigating the drive.

This is an [llms.txt](https://llmstxt.org/)-style map: human-readable, also
machine-navigable. When in doubt, follow the links.

## Owner

<set by `/setup`>

## Top-level categories

- **`notes/`** — raw personal notes (markdown, text). Chronological, unstructured. See `notes/CLAUDE.md`.
- **`projects/`** — one subdirectory per project. Surfaced in the myhub TUI. See `projects/CLAUDE.md`.
- **`communication/`** — email, chat, messaging archives. Read-only for agents. See `communication/CLAUDE.md`.
- **`wiki/`** — compiled knowledge (Karpathy LLM Wiki pattern). Auto-maintained by the `compiler` agent. See `wiki/CLAUDE.md`. Do not edit manually unless you want your edits preserved through the next compile.

## Conventions

- Every directory that needs context has its own `CLAUDE.md`.
- File names: `kebab-case.md` unless a tool imposes otherwise.
- Dates: ISO 8601 (`YYYY-MM-DD`) in filenames and content.
- Cross-references: `[[wikilinks]]` between wiki articles; `[source: relative/path.md](relative/path.md)` from wiki back to raw.

## When asked a question

Navigate, don't guess:

1. Check `wiki/` first (it's the synthesis layer).
2. If wiki doesn't answer, Grep raw content directly.
3. Always cite with a relative path when referencing a file.

## Not on this drive

- Source code for open-source tools the user consumes (clone on demand).
- Binary media files > 100 MB (keep elsewhere; reference by URL or hash).
- Work-issued data (corporate IP stays on corporate systems).
