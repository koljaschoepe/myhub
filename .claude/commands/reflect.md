---
description: Distill the current session into 0-3 memory entries (or updates to existing ones). Zero-entry is a valid outcome.
---

Read the current session transcript. Identify what's worth persisting across sessions:

- **User preferences** that emerged → `memory/feedback/` or `memory/user/`.
- **Project-specific facts** that were learned → `memory/projects/<project>/`.
- **Corrections or confirmations** → `memory/feedback/`.
- **Patterns / recurring workflows** → `memory/patterns/`.

For each identified entry:

1. **Grep memory/ first.** Does an existing file cover this? If yes, UPDATE that file — append, clarify, or correct.
2. **Otherwise create a new file** under the right subdir with standard frontmatter:
   ```
   ---
   name: <short descriptive name>
   description: <one-line hook, ~150 chars>
   type: <user|feedback|project|pattern|reference>
   ---
   ```
3. Append a one-line pointer to `memory/MEMORY.md`.

## Rules

- **Additive, not destructive.** Never bulk-rewrite existing memory. Small, surgical edits.
- **Zero-entry is valid.** If the session produced nothing memory-worthy, write nothing — say so.
- **Cite the moment.** Reference the commit or timestamp that triggered the insight.
- **Structured, not prose.** If a distillation is ambiguous, use the Interview primitive to confirm with the user (option A / option B), don't prose-ask.
- **Never include secrets.** If the session touched credentials or tokens, redact before writing.
