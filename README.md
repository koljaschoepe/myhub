# myhub

> Stecke ein. Werde KI.

A pluggable personal AI on a portable SSD. Plug the drive into any Mac, a
TUI project hub boots in a terminal, greets you with today's context, shows
your projects, and launches Claude Code in the one you pick — with full
context already loaded.

**Status:** architecture spec + working MVP (Phases 0–3 complete, Phase 4
in progress). See [`SPEC.md`](SPEC.md).

---

## What it is

- A **portable filesystem layout** that bundles Claude Code, its config,
  your content, and a TUI project hub into a single drive.
- An **install-once-per-Mac launchd hook** — on SSD mount, a Terminal
  opens, the `myhub` TUI starts, a proactive greeting shows what's
  changed, and Claude Code is one keystroke away in any project.
- A **layered context system** — root `CLAUDE.md`, per-domain `CLAUDE.md`,
  persistent `memory/` — that adapts to how you work over time.
- A **Karpathy-style LLM wiki** compiled from your raw notes, maintained
  automatically by a compiler agent.
- A first-class **Interview primitive** — every decision point
  (onboarding, `/setup`, destructive actions) is a structured
  multi-choice question, not a blank prompt.
- **Zero host footprint** beyond one ~1 KB launchd plist. Take the drive,
  take the whole brain.

## What it is not

- Not a cloud service. Embeddings, files, state — all local.
- Not a replacement for your PKM tool. Sits underneath Obsidian, Notes,
  whatever you use.
- Not opinionated about workflow. Minimal scaffolding, max adaptivity.
- Not a terminal emulator. It's a TUI that runs inside Terminal.app.

---

## Quickstart

```bash
# 1. APFS-format and label the SSD `myhub` (any label works; mount path
#    is auto-detected).

# 2. Download the latest release tarball + sha256. Verify:
curl -LO https://github.com/koljaschoepe/myhub/releases/latest/download/myhub-v0.1.0-darwin-arm64.tar.gz
curl -LO https://github.com/koljaschoepe/myhub/releases/latest/download/myhub-v0.1.0-darwin-arm64.tar.gz.sha256
shasum -a 256 -c myhub-v0.1.0-darwin-arm64.tar.gz.sha256

# 3. Extract to the drive root (--strip-components strips the top-level
#    "myhub/" wrapper inside the tarball).
tar -xzf myhub-v0.1.0-darwin-arm64.tar.gz -C /Volumes/myhub --strip-components=1

# 4. Clear Gatekeeper quarantine (binaries aren't notarized yet — see §6 below).
xattr -dr com.apple.quarantine /Volumes/myhub

# 5. Double-click /Volumes/myhub/.boot/install.command  (once per Mac, ever)

# 6. Drop the SSD (cmd+E), plug it back in — the TUI greets you.
```

On first launch the TUI runs a short onboarding wizard (structured
questions): name, language, TTS voice, default editor. Answers land in
`memory/config.toml` on the SSD — never on the host.

## CLI

The `myhub` maintenance CLI ships alongside the TUI:

```
myhub compile [--since 2d] [--full] [--dry-run]   # recompile wiki via the compiler agent
myhub health                                      # verify SSD structure
myhub stats                                       # file counts + sizes
myhub trust                                       # register this Mac in trusted-hosts.json
myhub manifest                                    # (re)generate manifest.json
myhub verify [--strict]                           # check SSD against manifest
```

## Safe mode

Plugging into a Mac you don't fully trust? Launch the TUI with `--safe-mode`:

```bash
/Volumes/myhub/bin/myhub-tui --safe-mode
```

Disables: TTS, `memory/` writes, onboarding wizard, auto-compile triggers.
You can still browse projects, read wiki, and start Claude — the session
just doesn't leave a trace on the SSD.

## Features at a glance

| | |
|---|---|
| 🖥️ TUI hub | Bubble Tea + Lipgloss; numbered project list, single-key launches, responsive tiers |
| 🎙️ Jarvis moment | On-mount greeting via `say -v Daniel`, optional Piper/ElevenLabs upgrade |
| 🧠 Memory | File-based, typed (`user/`, `feedback/`, `patterns/`), additively maintained |
| 📚 LLM Wiki | Karpathy-style; Claude navigates markdown instead of querying embeddings |
| 🔁 Auto-compile | fsnotify watches `content/`, 30s-debounced compiler triggers |
| 🔐 Auth on SSD | OAuth token on the drive, not host Keychain; plug-and-go across Macs |
| 🛡️ Manifest verify | SHA-256 ledger, tamper check on every mount |

## Development

```bash
# Go lives on the SSD (bootstrap once — ~260 MB).
./tooling/install-go.sh

# Build both binaries (bin/myhub-tui + bin/myhub, static darwin/arm64).
cd myhub-tui
export PATH="../tooling/go/bin:$PATH"
make build

# Run tests.
make test

# Vet + format.
make vet fmt
```

Source lives under `myhub-tui/`. See [`docs/authoring.md`](docs/authoring.md)
for CLAUDE.md conventions, [`docs/voice.md`](docs/voice.md) for TTS upgrade
paths.

## Architecture

Read [`SPEC.md`](SPEC.md) — the master document. It covers the filesystem
layout, boot sequence, auth model, knowledge architecture, Interview
primitive, security model, risks, and roadmap.

## Inspiration

- [Karpathy LLM Wiki pattern](https://venturebeat.com/data/karpathy-shares-llm-knowledge-base-architecture-that-bypasses-rag-with-an/) — retrieval-as-navigation, skip the vector DB at personal scale.
- [llms.txt](https://llmstxt.org/) — navigable map of a content drive.
- [OpenAra](https://github.com/koljaschoepe/OpenAra) — sibling project. Same
  TUI-launcher ergonomics for ARM64 headless servers; inherited palette,
  glyphs, and exec-launch pattern.

## License

MIT — see [`LICENSE`](LICENSE).
