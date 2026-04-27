---
name: product-pillars
status: living
last_touched: 2026-04-26
owner: Kolja
---

# Product pillars

Five non-negotiable principles. Every feature must respect all five.
If a feature breaks any pillar, the feature is wrong — not the pillar.

## 1. Privacy-first

The default mental model: nothing leaves the device unless the user explicitly sent a prompt to Claude.
- No telemetry. No crash reports. No analytics. No feature flags fetched at runtime.
- No proxy. AI requests go from the user's machine to api.anthropic.com under the user's own credentials. We never see the request.
- No background sync. The drive is the source of truth.

If you're tempted to add "anonymous usage stats", the answer is no.

## 2. SSD-portable

Everything Arasul needs lives on the drive: the app, the runtime, the vault, the content, the configuration. Ejecting the drive returns the host to the state it was in before.
- No host installs of language runtimes (we ship our own Python, our own Node when needed).
- No host config writes outside one ~1 KB launchd / autostart entry.
- Cross-OS: same drive, same data, on macOS / Linux / Windows.

If a feature requires writing to `~/.config/` or installing a system service, find another way.

## 3. Subscription-billed (no API costs by default)

The default AI path is the user's interactive Claude Code subscription, accessed by spawning the official `claude` CLI in a PTY. We never touch the OAuth token. The user can optionally paste an API key for batch / power-user workflows — but the bundled UX must work end-to-end on a $20/month Pro subscription.
- No `import anthropic`, no `import openai` in any default code path. Enforced by a `PreToolUse` hook.
- No Anthropic Agent SDK (subscription-incompatible by Anthropic policy).
- Workflows that "trigger AI" use `claude -p` (subprocess) — same billing source as the interactive session.

If you're tempted to "just call the API for this one feature", document the cost and gate it behind an API-key opt-in.

## 4. Zero ambient maintenance

Arasul updates only when the user runs the update flow inside the app. No background updaters. No "check for updates" daemons. No automatic content syncing.
- Manifest verified at mount time (tamper check), nothing else background-runs unless the user opened the app.
- Workflows have a maximum-iterations cap and a cost-preview before they start.

If a feature needs a daemon, find another way.

## 5. Offline-first

Every feature except actual AI prompting must work with the network unplugged. Vault unlock, file edits, project switching, workflows up to (but not including) the AI step, search, the spreadsheet editor — all offline.
- No CDN-fetched fonts at runtime. All assets bundled.
- No external image hosts in docs. Inline or local.
- No hard runtime dependency on a service we don't run.

If a feature degrades to "needs internet for everything", redesign it.
