# myhub

> Stecke ein. Werde KI.

A pluggable personal AI on a portable SSD. Plug the drive into any Mac, a
TUI project hub boots in a terminal, greets you with today's context, shows
your projects, and launches Claude Code in the one you pick — with full
context already loaded.

**Status:** working v3 (Python TUI port from [OpenAra](https://github.com/koljaschoepe/OpenAra)).
See [`SPEC.md`](SPEC.md) for the architecture; [`myhub-tui/README.md`](myhub-tui/README.md)
for TUI internals.

---

## What it is

- A **portable filesystem layout** that bundles Claude Code, its config,
  a relocatable Python runtime, your content, and a TUI project hub into
  a single drive.
- An **install-once-per-Mac launchd hook** — on SSD mount, a Terminal
  opens, the `myhub` TUI starts, a proactive greeting shows what's
  changed, and Claude Code is one keystroke away in any project.
- A **layered context system** — root `CLAUDE.md`, per-domain `CLAUDE.md`,
  persistent `memory/` — that adapts to how you work over time.
- A **Karpathy-style LLM wiki** compiled from your raw notes, maintained
  automatically by a compiler agent.
- A first-class **wizard primitive** — every decision point (onboarding,
  `/new`, destructive actions) is a structured multi-step flow.
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

# 4. Clear Gatekeeper quarantine (binaries aren't notarized yet).
xattr -dr com.apple.quarantine /Volumes/myhub

# 5. Bootstrap the SSD-portable Python runtime + uv (once per SSD).
bash /Volumes/myhub/tooling/install-python.sh
bash /Volumes/myhub/tooling/install-uv.sh
/Volumes/myhub/bin/uv pip install \
    --python /Volumes/myhub/runtime/python/bin/python3 \
    rich prompt-toolkit psutil PyYAML

# 6. Double-click /Volumes/myhub/.boot/install.command  (once per Mac, ever)

# 7. Drop the SSD (cmd+E), plug it back in — the TUI greets you.
```

On first launch the TUI runs a short onboarding wizard and asks for your
name. Answers land in `memory/config.toml` on the SSD — never on the host.

## TUI commands

Once booted, 14 commands across 5 categories — use slash syntax (`/open`)
or natural language (`open myhub`, `pull`, `ls`):

| Category | Commands |
|---|---|
| **Projects** | `/open` `/info` `/new` `/delete` `/repos` (aliases: `o`, `i`, `n`, `d`, `ls`, `list`) |
| **AI** | `/claude` `/brief` (aliases: `c`) |
| **Git** | `/git pull/push/log/status` `/lazygit` (aliases: `pull`, `push`, `status`, `g`, `lg`) |
| **System** | `/compile` `/verify` `/stats` (aliases: `s`) |
| **Meta** | `/help` `/quit` (aliases: `?`, `h`, `q`, `exit`) |

A number `1`..`N` opens the Nth project. `Ctrl-C` / `Ctrl-D` quits.

## Maintenance CLI

The Go-based `myhub` CLI sits alongside the TUI for scriptable ops:

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

Disables: `memory/` writes, onboarding wizard, auto-compile triggers.
You can still browse projects, read wiki, and start Claude — the session
just doesn't leave a trace on the SSD.

## Features at a glance

| | |
|---|---|
| 🖥️ TUI hub | Python · prompt_toolkit + rich; numbered project list, slash or natural-language dispatch, responsive tiers (FULL / MEDIUM / COMPACT) |
| 📋 On-mount briefing | Headless `claude -p --agent briefer` produces a 2–5 line context-aware greeting; static fallback if claude is missing |
| 🔀 Wizard flows | Pending-handler pattern (OpenAra-ported): multi-step `/new`, confirm-on-`/delete`, first-run onboarding |
| 🧠 Memory | File-based, typed (`user/`, `feedback/`, `patterns/`), additively maintained |
| 📚 LLM Wiki | Karpathy-style; Claude navigates markdown instead of querying embeddings |
| 🔁 Auto-compile | Compiler agent invocation via `/compile`; watcher re-integration on roadmap |
| 🔐 Auth on SSD | OAuth token on the drive, not host Keychain; plug-and-go across Macs |
| 🛡️ Manifest verify | SHA-256 ledger, tamper check on every mount |
| 🐍 Portable Python | python-build-standalone relocatable runtime on SSD; no host Python needed |

## Development

### TUI (Python)

```bash
# Python runtime + uv land on the SSD — one-time bootstrap.
bash tooling/install-python.sh
bash tooling/install-uv.sh
bin/uv pip install --python runtime/python/bin/python3 \
    rich prompt-toolkit psutil PyYAML pytest

# Run the TUI in-place.
bin/myhub-tui

# Run the test suite (37 tests).
cd myhub-tui
PYTHONPATH=. ../runtime/python/bin/python3 -m pytest tests/
```

### Maintenance CLI (Go)

```bash
# Go lives on the SSD (bootstrap once — ~260 MB).
./tooling/install-go.sh

# Build bin/myhub.
cd myhub-cli
export PATH="../tooling/go/bin:$PATH"
go build -o ../bin/myhub ./cmd/myhub

# Run tests.
go test ./...
```

Source:
- [`myhub-tui/`](myhub-tui/README.md) — Python TUI package
- [`myhub-cli/`](myhub-cli/) — Go maintenance CLI
- [`docs/authoring.md`](docs/authoring.md) — CLAUDE.md conventions

## Architecture

Read [`SPEC.md`](SPEC.md) — the master document. Covers the filesystem
layout, boot sequence, auth model, knowledge architecture, wizard
primitive, security model, risks, and the v2→v3 pivot rationale.

## Inspiration

- [Karpathy LLM Wiki pattern](https://venturebeat.com/data/karpathy-shares-llm-knowledge-base-architecture-that-bypasses-rag-with-an/) — retrieval-as-navigation, skip the vector DB at personal scale.
- [llms.txt](https://llmstxt.org/) — navigable map of a content drive.
- [OpenAra](https://github.com/koljaschoepe/OpenAra) — sibling project. v3
  is a targeted **port** of its UX architecture (palette, command
  registry, wizard pattern, dashboard rendering) to the macOS SSD
  context. Linux-server pieces (Jetson/RPi, fail2ban, n8n, tailscale,
  playwright) stay upstream.

## License

MIT — see [`LICENSE`](LICENSE).
