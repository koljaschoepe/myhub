# Arasul — Private Beta Program

> Minimal version. No Cloudflare, no form server, no telemetry. Just email.

## Signup flow

Prospective testers fill `landing/signup.html`. The form opens their email client with a pre-filled message to `hello@arasul.dev`. That's it — no webhook, no KV store, no database. Triage = the inbox.

The landing page tells them what to expect: a direct reply within a week if you approve them, nothing if you don't.

## Approval

Once per week, skim the inbox, pick the approvals based on fit (student / researcher / tech writer / indie dev audiences first). Reply with:

- A plain-English walkthrough of the install (link to the latest GitHub release + link to `arasul.dev/support.html`).
- A Discord invite link.
- A promise to reply to any bug reports in under 48h.

Exit criteria for graduation (from Phase 6):

- D7 retention > 60%
- NPS > 30
- ≥ 3 usable testimonials
- Zero data-loss incidents

Retention is measurable if the user has opt-in telemetry on — which we removed. Instead we measure by asking: "still using it? any papercuts?" at D7 and D30 via email.

## Weekly cadence

- **Monday** — cut a release (`git tag arasul-v0.x.y && git push origin …`). Release notes come from conventional-commit messages or a hand-written `RELEASE_BODY.md`.
- **Wednesday** — office hours on Discord voice (2 slots: EU-friendly + US-friendly). Skippable; nobody's required to show up.
- **Friday** — triage: open issues in Github + bug reports in Discord. Target: 48h SLA for any drive-eats-data regression.

## Discord server template

Same as before — see Phase 6 discord template below. Nothing external-service beyond the Discord account itself, which is free.

| Channel | Purpose |
|---|---|
| `#announcements` | release notes, outages |
| `#general` | anything |
| `#feature-requests` | vote on candidates |
| `#bug-reports` | w/ template: steps · expected · actual · OS |
| `#show-and-tell` | how people use Arasul |
| `#security` | report via email to security@arasul.dev preferred |
| `#office-hours` | voice, 2×/week |

## Data we keep on signers

Just the email we replied to, in our sent-mail archive. No database, no CRM, no retention policy — when you clean your inbox, the record is gone.

If anyone asks "please forget me," reply "already done — we don't store signup data anywhere except this email thread, which I'm about to delete." Then do.
