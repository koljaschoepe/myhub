# communication/ — email, chat, and messaging archives

Exports of conversations, organized by channel. **Read-only for agents.**

## Typical structure

(Grows as archives are added; mkdir on demand.)

- `email/` — mbox files per account. Personal and work separate.
- `whatsapp/` — WhatsApp exports, JSON, one file per chat.
- `slack/` — Slack exports if applicable.
- `signal/` — Signal exports if applicable.
- `sms/` — iMessage/SMS exports if applicable.

## Rules when parsing

- **Cite timestamps and channel** whenever quoting. (`[2024-07-03 WhatsApp/Alex]`).
- **Respect privacy.** When summarizing, avoid long verbatim blocks unless the user explicitly asks.
- **No bulk rewriting.** The `compiler` builds per-person wiki articles from here; don't pre-summarize inside this directory.
- **Redact sensitive fragments** (API keys, passwords, card numbers) if they accidentally appear in an export.

## Why this dir is valuable

The wiki's `people/` category is compiled primarily from here. Timelines,
recurring themes per person, and context for resuming threads all trace back
to communication exports. Treat it accordingly.
