---
description: First-run onboarding. Captures name, language, TTS prefs via structured (Interview-primitive) questions and writes them to content/CLAUDE.md and memory/config.toml.
---

Onboarding runs as a series of structured questions (Interview primitive, §12 of SPEC.md). Do NOT ask free-form prose questions — every step has a finite option set (plus an "other" escape hatch).

## Steps

**1. Name** (free-text, single field)
> "Wie heißt Du?"
→ stored in `content/CLAUDE.md` and as `user.name` in `memory/config.toml`.

**2. Primary interaction language** (choice)
- Deutsch
- English
- Deutsch-Englisch-Mix *(Recommended)* — mixed is natural for technical work
→ stored as `user.language` in `memory/config.toml`.

**3. TTS voice on mount** (choice)
- An, Daniel (British male, Jarvis-flavored) *(Recommended)*
- An, andere Stimme → open free-text for `say -v '?'`-compatible name
- Aus
→ stored as `tts.enabled` + `tts.voice` in `memory/config.toml`.

**4. Default editor** (choice, optional)
- `nvim` *(Recommended if installed)*
- `vim`
- `code` (VS Code)
- `nano`
→ stored as `editor.default` in `memory/config.toml`.

## After the questions

1. Write/update `content/CLAUDE.md` with the user's name in the template.
2. Write/update `memory/config.toml` (TOML: sections `[user]`, `[tts]`, `[editor]`).
3. Confirm one line: `Setup fertig, {name}. Wähle ein Projekt oder Ctrl-D.`

Do not add further personalization here — the rest grows organically via `/reflect`.
