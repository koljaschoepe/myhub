# myhub

> Stecke ein. Werde KI.

A pluggable personal AI on a portable SSD. Plug the drive into any Mac, a TUI project hub boots in a terminal, greets you, shows your projects, and launches Claude Code in the one you pick — with full context already loaded.

**Status:** architecture spec, pre-implementation. See [`SPEC.md`](SPEC.md).

---

## What it is

- A portable filesystem layout that bundles Claude Code, its config, your content, and a TUI project dashboard onto a single drive.
- A one-time-per-Mac launchd hook: on SSD mount, a Terminal opens, the `myhub` TUI starts, a proactive greeting shows what's changed and what's open, and Claude Code is one keystroke away in any project.
- A layered context system (root `CLAUDE.md`, per-domain `CLAUDE.md`, persistent `memory/`) that grows with how you work.
- Zero host footprint beyond one ~1 KB launchd plist. Take the drive, take the whole brain.

## What it is not

- Not a cloud service. Everything is local and on the drive.
- Not a replacement for your PKM tool. Sits underneath whatever you use.
- Not opinionated about workflow. Minimal scaffolding, maximal adaptivity.

## Quickstart

See [`SPEC.md`](SPEC.md) § Roadmap. Implementation has not started — repo is public from day one to track the design process.

## Inspiration

- [Karpathy LLM Wiki pattern](https://venturebeat.com/data/karpathy-shares-llm-knowledge-base-architecture-that-bypasses-rag-with-an/) — knowledge-base-as-markdown, retrieval-as-navigation.
- [llms.txt](https://llmstxt.org/) — navigable map of a content drive.
- [OpenAra](https://github.com/koljaschoepe/OpenAra) — sibling project: same TUI-launcher pattern for ARM64 headless servers.

## License

MIT — see [`LICENSE`](LICENSE).
