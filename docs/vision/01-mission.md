---
name: mission
status: living
last_touched: 2026-04-26
owner: Kolja
---

# Mission

Arasul is a portable, offline-capable AI workspace that lives entirely on a USB-C SSD.

You plug the drive into any computer (macOS, Linux, Windows). A native desktop app boots, unlocks an encrypted vault, and gives you a chat-and-files workspace powered by **your own Claude Code subscription** — no API keys, no proxy servers, no Arasul cloud.

When you eject the drive, nothing of yours stays on the host machine.

## Why this exists

The cheapest way to use frontier AI today is the $20–200/month Claude Code subscription. The most private way to use it is on hardware you carry. No commercial product combines both: every "AI workspace" routes through someone else's infra and charges for tokens that the user is already paying for separately.

Arasul collapses that gap. The user pays Anthropic once; Arasul is the local UI that wraps the official `claude` CLI without ever touching the credentials.

## What it must always do

1. Run **without** an internet connection except for the AI requests themselves (which the user authorizes).
2. Run **without** an Anthropic API key — the user's interactive Claude subscription is the only billing source by default.
3. Be **fully removable** by ejecting the drive (no daemons, no host config, no telemetry).
4. Work the **same** on macOS, Linux, and Windows from the same drive.

## What it will never do

- Proxy, cache, or log AI requests/responses on Arasul-owned infrastructure.
- Extract or relay the user's OAuth tokens.
- Auto-pilot the AI session to power features the user didn't trigger.
- Phone home for analytics, crash reports, or feature flags.

## How we'll know we succeeded

A user can hand the drive to a friend, the friend can plug it into a different OS, log in with their own Claude account in two clicks, and have a working AI workspace in under five minutes — with their data leaving their machine only when they explicitly send a prompt.
