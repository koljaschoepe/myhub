# SPEC — myhub

> **Codename:** `myhub` · **Target:** macOS 14+ (Apple Silicon only for MVP) · **License:** MIT · **Status:** Architecture spec, pre-implementation · **Repo:** public from day one

A pluggable personal AI: stick in the drive, a Jarvis-like voice greets you, a context-aware self-learning assistant that knows everything you've ever written boots up and starts the conversation before you do.

---

## 1. Vision

**One sentence:** Plug in an SSD, and your personal AI — the one that knows your notes, code, conversations, and ways of thinking — boots up in a terminal and starts the conversation before you do.

**What it is:**
- A portable filesystem layout that bundles Claude Code, its config, your content, and a hybrid knowledge index into a single drive.
- An install-once-per-Mac launchd hook that, on SSD mount, plays a sound, shows a notification, opens a terminal tab, and starts Claude Code *with the vault's context already loaded*.
- A self-healing semantic + lexical index over everything on the drive, exposed to Claude as an MCP tool.
- A layered context system (global `CLAUDE.md`, per-domain `CLAUDE.md`, persistent memory) that adapts to the user over time.
- A minimal agent scaffold — infrastructure exists, but only 1–2 opinionated agents ship; the rest the user grows organically.

**What it is not:**
- Not a cloud service. Embeddings are local, files are local, index is local.
- Not a replacement for a PKM app. It sits *underneath* whatever you use and reads the files that tool produces.
- Not opinionated about your workflow. Minimal scaffolding, max adaptivity.

---

## 2. Design Principles

1. **The SSD is the source of truth.** Anything on the host Mac is a cache or a trigger — never state. You lose the drive, you lose the whole system; you lose the Mac, you lose nothing.
2. **Rohdaten immer menschenlesbar.** Your files stay as plain files. Indices can be rebuilt from them. Never trap the user's data behind the tool.
3. **Clean over clever.** Short answers, no redundant context, no pre-baked opinions. The user's own `CLAUDE.md` and memory are the only persona layer.
4. **Adaptive, not prescriptive.** Learn from what the user writes and does. Never hardcode workflow assumptions.
5. **Zero host footprint except the trigger.** One tiny launchd plist per Mac. Everything else runs from the drive.
6. **Reliable over fancy.** Graceful degradation at every layer: if Ollama isn't running, fall back to on-demand grep; if index is stale, still respond; if a new Mac has no binary installed, launcher prints exact fix command.
7. **Proactive on mount.** First thing the user sees is a brief, context-aware greeting — not a blank prompt.

---

## 3. System Architecture (Stack Overview)

```
┌────────────────────────────────────────────────────────────────────┐
│ LAYER 5 · INTERACTION                                              │
│  Claude Code CLI · proactive greeting on launch · slash commands   │
├────────────────────────────────────────────────────────────────────┤
│ LAYER 4 · PERSONA / CONTEXT                                        │
│  root CLAUDE.md · per-domain CLAUDE.md · memory/ · agents/         │
├────────────────────────────────────────────────────────────────────┤
│ LAYER 3 · INTELLIGENCE                                             │
│  myhub-mcp server · agents · hooks · skills                        │
├────────────────────────────────────────────────────────────────────┤
│ LAYER 2 · KNOWLEDGE INDEX                                          │
│  LanceDB (semantic) · Tantivy (lexical) · SQLite (metadata)        │
│  Nomic Embed v2 via Ollama · bge-reranker for top-k                │
├────────────────────────────────────────────────────────────────────┤
│ LAYER 1 · RAW CONTENT                                              │
│  content/ — notes, projects, communication (as plain files)        │
├────────────────────────────────────────────────────────────────────┤
│ LAYER 0 · RUNTIME                                                  │
│  Claude Code binary (dual-arch) · Ollama · ripgrep · fswatch       │
└────────────────────────────────────────────────────────────────────┘
         ▲
         │ triggered by
         │
┌────────────────────────────────────────────────────────────────────┐
│ HOST: launchd LaunchAgent (StartOnMount) → on-mount.sh on SSD      │
│       play sound · notify · open Terminal · cd · exec claude       │
└────────────────────────────────────────────────────────────────────┘
```

---

## 4. Filesystem Layout

```
/Volumes/myhub/                      ← the SSD (name chosen once; mount-path agnostic)
│
├── .boot/                           ← anything needed BEFORE claude starts
│   ├── install.command              ← double-click once per Mac; installs launchd hook
│   ├── uninstall.command            ← removes launchd hook from current Mac
│   ├── on-mount.sh                  ← invoked by launchd on mount; orchestrates boot
│   ├── launcher.sh                  ← arch-detects, sets env, execs claude
│   ├── plist.template               ← LaunchAgent plist (paths substituted at install)
│   ├── preflight.sh                 ← checks Ollama, binaries, index health
│   └── assets/
│       ├── connect.aiff             ← "AI connected" sound (chosen: tbd)
│       └── icon.icns                ← drive icon
│
├── bin/                             ← all runtimes live here; host needs nothing
│   ├── claude                       ← Claude Code binary (arm64; x64 later)
│   ├── rg                           ← ripgrep (optional, Claude has its own Grep)
│   └── fswatch                      ← filesystem watcher (for auto-compile triggers)
│
├── .claude/                         ← CLAUDE_CONFIG_DIR points here
│   ├── settings.json                ← permissions, hooks, MCP refs
│   ├── mcp.json                     ← registers myhub-mcp server
│   ├── agents/
│   │   ├── curator.md               ← bake-in #1 — maintains the index
│   │   └── briefer.md               ← bake-in #2 — generates on-mount greeting
│   ├── skills/                      ← empty scaffold; user grows over time
│   ├── commands/                    ← slash commands
│   │   ├── setup.md                 ← /setup — minimal onboarding (name)
│   │   ├── brief.md                 ← /brief — regenerate greeting mid-session
│   │   └── reflect.md               ← /reflect — distill session → memory
│   ├── hooks/
│   │   ├── session-start.sh         ← generates proactive greeting
│   │   └── session-end.sh           ← calls briefer agent to write memory delta
│   └── output-styles/
│       └── terse.md                 ← "short, punchy, never repeat yourself"
│
├── content/                         ← YOUR raw files. The soul of the thing.
│   ├── CLAUDE.md                    ← ROOT MAP (llms.txt-style): who, what's here, where
│   ├── wiki/                        ← COMPILED knowledge (auto-maintained by compiler)
│   │   ├── CLAUDE.md                ← wiki article index
│   │   ├── people/                  ← one article per recurring person
│   │   ├── projects/                ← one per project
│   │   ├── concepts/                ← recurring ideas, patterns, mental models
│   │   └── timeline/                ← weekly/monthly chronological digests
│   ├── notes/
│   │   └── CLAUDE.md                ← domain context for notes (hand-written)
│   ├── projects/
│   │   └── CLAUDE.md                ← per-project CLAUDE.md live in their repos
│   └── communication/
│       └── CLAUDE.md                ← context for parsing chat/email archives
│
├── memory/                          ← self-learning layer (persistent across sessions)
│   ├── MEMORY.md                    ← index of memory files (always loaded)
│   ├── user/                        ← what we've learned about the user
│   ├── feedback/                    ← corrections/confirmations over time
│   ├── patterns/                    ← recurring themes, preferred workflows
│   └── sessions/                    ← compressed session logs (rolling retention)
│
├── myhub-cli/                       ← small CLI for maintenance tasks
│   ├── myhub compile                ← force full wiki recompile
│   ├── myhub health                 ← verify manifest hashes + wiki freshness
│   ├── myhub stats                  ← file counts, wiki size, memory size
│   └── myhub trust                  ← register host Mac as trusted
│
├── manifest.json                    ← SHA-256 of every script + expected structure
├── README.md                        ← "Stecke ein. Werde KI."
└── VERSION
```

**Why this layout:**
- `content/` is pristine and portable — you could `cp -r` it into any other tool.
- `memory/` mirrors Claude Code's own memory pattern (MEMORY.md index + typed files), but lives on the SSD and travels.
- `index/` is derivable — ships with a fresh build but is never load-bearing; reindex is always an option.
- `.claude/` is a standard Claude Code config dir, just relocated.
- `.boot/` and `bin/` are implementation details the user rarely touches.

---

## 5. Boot & Mount Sequence

### 5.1 First time on a new Mac
```
1. User plugs in SSD → finder shows "vault" mounted at /Volumes/myhub
2. User double-clicks /Volumes/myhub/.boot/install.command (once, ever, per Mac)
3. install.command:
   - runs manifest verification (SHA-256 of all scripts)
   - shows trust dialog listing what's about to install
   - copies plist.template → ~/Library/LaunchAgents/com.myhub.mount.plist
     (with hardcoded VOL_LABEL = "vault")
   - runs: launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.myhub.mount.plist
   - registers this Mac's hardware UUID in /Volumes/myhub/.boot/trusted-hosts.json
   - runs on-mount.sh immediately (simulates a mount) so the first session
     starts right after install
```

### 5.2 Every subsequent mount
```
launchd sees mount event (StartOnMount=true)
  └─ executes stub in plist that resolves the real mount path
        (handles /Volumes/myhub vs /Volumes/myhub 1 via UUID lookup)
      └─ runs /Volumes/myhub/.boot/on-mount.sh
            ├─ verifies manifest.json hashes (tamper-check)
            ├─ plays connect.aiff via afplay
            ├─ shows notification "vault connected" via osascript
            ├─ runs preflight.sh (Ollama up? index fresh? binaries OK?)
            └─ opens Terminal.app via AppleScript:
                  cd /Volumes/myhub && ./bin/launcher.sh
```

### 5.3 The launcher
```bash
# /Volumes/myhub/bin/launcher.sh (simplified)
MYHUB="$(cd "$(dirname "$0")/.." && pwd)"
ARCH=$(uname -m)
case "$ARCH" in
  arm64)  CLAUDE="$MYHUB/bin/claude-arm64" ;;
  x86_64) CLAUDE="$MYHUB/bin/claude-x64"  ;;
esac
export CLAUDE_CONFIG_DIR="$MYHUB/.claude"
export CLAUDE_CODE_PLUGIN_CACHE_DIR="$MYHUB/.claude/plugins"
export MYHUB_ROOT="$MYHUB"
export PATH="$MYHUB/bin:$PATH"

# Start Ollama if not running (embedding runtime)
pgrep -x ollama >/dev/null || "$MYHUB/bin/ollama" serve >/dev/null 2>&1 &

cd "$MYHUB/content"
exec "$CLAUDE" "$@"
```

**Latency target:** mount → Claude visible in terminal ≤ 3 seconds.

---

## 6. Auth Model

**Decision: Claude Pro/Max OAuth, credentials stored *on the SSD*.**

Guiding principle: **the Mac is pure compute. Nothing auth-related touches the host.**

Mechanics:
- Launcher sets `CLAUDE_CONFIG_DIR=/Volumes/myhub/.claude` *before* exec'ing `claude`.
- Claude Code on macOS normally stores OAuth tokens in the system Keychain — but when `CLAUDE_CONFIG_DIR` is set, tokens land in `${CLAUDE_CONFIG_DIR}/.credentials.json` with mode 0600.
- First-ever launch (on any Mac): `claude` prompts `/login` → browser OAuth → token written to the SSD.
- Every subsequent launch (same Mac, different Mac, doesn't matter): token is already on the SSD → zero-friction, zero login.
- Anthropic's OAuth tokens are **not device-bound**, so the same token works across arm64 and x64 Macs.

Flow-of-secrets summary:
| Artifact | Lives on |
|---|---|
| OAuth refresh token | `/Volumes/myhub/.claude/.credentials.json` (SSD) |
| macOS Keychain entry | — (never written) |
| Host-side config files | — (only the 20-line launchd stub in `~/Library/LaunchAgents/`) |

### 6.1 Risk accepted with this choice
- **Lost/stolen SSD** → finder has your Claude subscription access until the token expires or you revoke it via `claude.ai/settings/connected-apps` (or equivalent). Bounded: subscription rate limits cap damage; Pro/Max is a flat fee so no bill shock.
- **Unencrypted SSD** (per §15) compounds this: credential file is readable without auth. Mitigation options you can opt into later without changing the architecture:
  - (a) Flip `content/communication/` (the most sensitive subfolder) into an `age`-encrypted bundle — content stays plug-and-go, credentials do too, only the communication archive requires a passphrase on first access per session.
  - (b) Full APFS-encrypt the volume — one passphrase on mount, nothing else changes.
  - (c) `age`-encrypt just `.credentials.json` with a short passphrase prompted at launcher time — preserves plug-and-go for data but requires 4-digit PIN once per mount to reach Claude.
- Revocation path: if SSD is lost, user logs in at claude.ai and revokes the OAuth app. Mention prominently in README.

### 6.2 What this buys
True isolation. You take out the drive, walk to any Mac, plug in, and the same personal AI — same memory, same files, same auth — is there in ~3 seconds. The laptop contributes CPU and screen; nothing else.

---

## 7. Knowledge Architecture — the LLM Wiki Pattern

> **Architectural pivot from v0 of this spec.** Originally planned as LanceDB + Tantivy + Ollama (RAG stack). Replaced with the [Karpathy LLM Wiki pattern](https://venturebeat.com/data/karpathy-shares-llm-knowledge-base-architecture-that-bypasses-rag-with-an/) + [llms.txt](https://llmstxt.org/) navigation: dramatically simpler, zero ML runtime, no pre-built index, no embedding model — and for personal scale (hundreds of articles, ~hundreds of thousands of words) *measurably better* per Answer.AI / Karpathy. RAG stays on the roadmap as Phase 5, to be added *only* if we hit a real limit.

### 7.1 Core idea
The knowledge base IS the markdown. A "compiler" agent reads your raw files and maintains an evolving, interlinked wiki in `content/wiki/`. Claude Code auto-loads the root `content/CLAUDE.md` (an llms.txt-style map of the whole drive) at every session start, then navigates into the wiki and raw content using its native Read/Grep/Glob tools. Retrieval = navigation, not embeddings.

### 7.2 Why this wins at personal scale
- **Context-window math:** Opus 1M holds ~750k tokens of content. A focused personal wiki fits whole. No retrieval noise.
- **Zero infrastructure:** No Ollama, no LanceDB, no Tantivy, no SQLite, no separate MCP server, no index rebuild cycle. Just markdown files.
- **Human-readable:** The wiki is legible without any tooling. Git-diffable. Fully portable. Corruption-proof (source files are ground truth).
- **Self-improving:** Every compile pass makes the wiki tighter. Duplicates collapse, cross-references densify, stale articles get archived.
- **Zero ML cost:** No embedding model to download, version, or re-run.

### 7.3 The structure
```
content/
├── CLAUDE.md           ← ROOT MAP (auto-loaded every session)
│                         llms.txt-style: what lives on this drive, where, how to navigate
├── wiki/               ← compiled knowledge, auto-maintained
│   ├── CLAUDE.md       ← index of wiki articles (also an llms.txt-style map)
│   ├── people/         ← one markdown article per recurring person (relationships, projects)
│   ├── projects/       ← one per project (status, decisions, context, open threads)
│   ├── concepts/       ← recurring ideas, mental models, recipes, patterns
│   └── timeline/       ← weekly + monthly digests, chronological
├── notes/              ← your raw notes. never touched by compiler, only read.
├── projects/           ← code repos. same.
└── communication/      ← email/chat archives. same.
```

The wiki links back to source files (`[source: notes/2025/my-note.md](...)`). Claude can always drill down to raw.

### 7.4 The compiler agent
`.claude/agents/compiler.md` is invoked:
- **On command**: `/compile` (user-triggered full recompile) or `/compile --since=2d` (incremental)
- **On session end**: `SessionEnd` hook fires it if the session modified `content/` — the agent scans the diff, updates affected wiki articles, writes 0–3 memory entries.
- **On file drop**: `fswatch` watches `content/notes`, `content/projects`, `content/communication` during session; debounced (30s); queues changed files.

What it does each pass:
1. Enumerates changed raw files since last compile (tracked in `memory/compile-state.json`).
2. For each changed file: decides *new article?*, *update existing?*, *merge duplicates?*, *archive as stale?*
3. Writes/edits `content/wiki/*.md` using Claude's own Write/Edit tools.
4. Updates `content/CLAUDE.md` root map if a new category emerges.
5. Maintains cross-reference links: [wikilinks] between articles, source backrefs to raw.
6. Never modifies raw source files. Wiki is derivative.
7. Writes a 3-line compile-log to `memory/sessions/`.

### 7.5 Navigation flow (when you ask a question)
```
User: "Was hatte ich letztes Jahr mit Projekt X besprochen?"
   │
   ▼
Claude loads content/CLAUDE.md  (root map, always in context)
   ▼
Claude identifies: "Projekt X" maps to → wiki/projects/projekt-x.md
   ▼
Claude reads wiki/projects/projekt-x.md  (compiled article)
   ▼
Needs specifics → follows [source: communication/slack-2024-...] link
   ▼
Claude.Read on the raw file, grabs exact quote
   ▼
Answers with citation.
```

No embeddings queried. No index service. Just file reads on a local SSD (µs-scale).

### 7.6 Failsafe
- `myhub compile --full` re-derives the entire wiki from raw. Idempotent.
- Wiki corruption = no real loss. Raw content is ground truth.
- `myhub health` verifies manifest hashes + wiki/source link integrity.

### 7.7 When to add RAG (Phase 5, possibly never)
Trigger signals:
- Compiled wiki collectively > ~200k tokens (pushing context limits for every session).
- You repeatedly ask questions whose answers are in raw content but not surfaced by wiki navigation.
- "Find everything about X" requires too many Claude roundtrips.

Then, in order: (5a) add Tantivy BM25 as an additional MCP tool for instant lexical search; (5b) add LanceDB + Nomic Embed for semantic. Wiki pattern stays as the *primary* layer; RAG becomes a search tool Claude reaches for when navigation fails.

---

## 8. Context & Persona System (Layer 4)

Three concentric rings, merged by Claude Code at session start:

### 8.1 Root persona — `content/CLAUDE.md`
Hand-written by the user over time (grows with `/setup` then organically). Template stub:
```markdown
# Who I am
Name: <filled by /setup>

# How I work
(empty; populated by /reflect over time)

# What I care about
(empty; populated over time)
```

### 8.2 Domain context — `content/*/CLAUDE.md`
Each top-level content directory has its own CLAUDE.md for local context. Example — `content/communication/CLAUDE.md`:
```markdown
# Communication archive
- notes/whatsapp/  : WhatsApp exports, JSON, one file per chat
- notes/email/     : mbox files per account, personal + work separate
Always cite message timestamps when referencing.
```

### 8.3 Persistent memory — `memory/`
Mirrors the Claude Code memory pattern. `MEMORY.md` is the always-loaded index; typed memory files (`user_*.md`, `feedback_*.md`, `pattern_*.md`) live in subdirs.

- Written automatically by `/reflect` command + `session-end.sh` hook.
- `/reflect` distills the just-ended session into 0–3 new memory entries (or updates existing).
- Read at every session start via Claude Code's own memory-access mechanism.

**Rule:** memory is *additive and corrective*. Never bulk-rewrite. Always dedupe by semantic similarity (reuse `kb_search` against memory/ itself).

---

## 9. Proactive On-Mount Behavior — the Jarvis Moment

Full sequence from "plug in" to "AI talks to me":

```
  SSD plugged in
        │
        ▼
  launchd fires com.myhub.mount.plist (StartOnMount=true)
        │
        ▼
  on-mount.sh runs from /Volumes/myhub/.boot/
        │
        ├─→ afplay .boot/assets/connect.aiff              (boot sound)
        ├─→ osascript display notification "myhub connected"
        ├─→ preflight.sh (binary + config sanity check)
        └─→ osascript opens Terminal.app, cd, runs launcher.sh
                │
                ▼
          claude starts with CLAUDE_CONFIG_DIR=/Volumes/myhub/.claude
                │
                ▼
          SessionStart hook fires session-start.sh
                │
                ├─→ reads memory/MEMORY.md (name, open threads, patterns)
                ├─→ git log --since="last session" over content/projects/*
                ├─→ find content/ -newer <last-session-timestamp>
                ├─→ invokes `briefer` agent → produces 2–5 line greeting
                │
                ├─→ writes greeting into terminal (instantly visible)
                │
                └─→ pipes greeting text to `say -v Daniel` (async, TTS)
                         │
                         ▼
                   Jarvis-style voice reads greeting aloud
```

### 9.1 The greeting (no blank prompt, ever)

Example output on mount (Monday morning, after the weekend):
```
Guten Morgen, Kol. Freitag hattest Du den SPEC für myhub geschrieben.
Übers Wochenende 12 neue Notizen in /research, Projekt-X: 4 Commits.
Offener Faden: Reformatierung T7 auf APFS.
Woran willst Du anknüpfen?
```

And `say -v Daniel` reads it aloud — short, punchy, cinematic. Tone locked by `output-styles/terse.md` (no "I'll help you with...", no preamble, no closing platitudes).

### 9.2 Voice control
- **Default voice: `Daniel`** (British male, closest to Jarvis-tone, ships with macOS out-of-box).
- Configurable in `.claude/settings.json` → `myhub.tts.voice`. Any voice from `say -v '?'` works (Ava, Zoe, Evan, Oliver, custom...).
- Upgrade path documented in `docs/voice.md`:
  - **Premium neural voices** (Ava, Evan etc. with "Premium" suffix) — higher quality, downloadable via Systemeinstellungen > Barrierefreiheit > Gesprochene Inhalte.
  - **Piper TTS** (local, offline, cinematic-quality neural voices, ~100 MB bundled on SSD) — recommended v2 upgrade.
  - **ElevenLabs** (cloud, paid, truly Jarvis-level) — when you want the cinematic upgrade.
- Kill-switch: `MYHUB_TTS=0` env var or `myhub.tts.enabled=false` in settings.
- TTS runs async (`&`) so terminal text appears instantly; voice catches up.

### 9.3 Reliability safeguards
- If `briefer` agent errors → fall back to a static greeting + list of recent file changes. Never block startup.
- If `say` missing (shouldn't happen on macOS) → silent fallback, no crash.
- If `memory/MEMORY.md` missing → first-time user flow, suggest `/setup`.

---

## 10. Slash Commands & Agents (Opinionated Scaffolding)

### 10.1 Ship-with slash commands (3)
- **`/setup`** — runs once. Asks for name, saves to `content/CLAUDE.md`. Optionally asks 1–2 more things (timezone, preferred language) — all skippable. Total: <60 seconds.
- **`/brief`** — regenerates the proactive briefing mid-session.
- **`/reflect`** — "what did we learn / decide here?" → distills session → appends to `memory/`.

Everything else the user creates.

### 10.2 Ship-with agents (2)
- **`compiler`** — the wiki maintainer (§7.4). Invoked by `/compile`, `SessionEnd` hook, and `fswatch` triggers. Reads changed raw files, updates `content/wiki/*.md`, prunes stale articles, maintains root `content/CLAUDE.md` map, writes short compile logs to `memory/sessions/`. Also handles duplicate detection by file hash.
- **`briefer`** — the on-mount greeter (§9). Reads `memory/MEMORY.md` + recent `content/` changes, produces the 2–5 line greeting message that gets displayed AND read aloud via TTS.

That's it. No "research-assistant", "code-reviewer", "writing-coach" etc. — user grows those when *they* need them. **Framework exists, content doesn't.**

### 10.3 Ship-with hooks
- `SessionStart` → runs `session-start.sh` (generates greeting + kicks off TTS)
- `SessionEnd` → runs `session-end.sh` (runs `compiler` if content/ was touched, writes memory delta)
- `PostToolUse` on Write/Edit inside `content/` (excluding `content/wiki/`) → enqueues changed file for next `compiler` pass

---

## 11. Architecture Target (simplified)

- **Apple Silicon only** (arm64) for v1. Intel x64 support is a post-v1 backlog item if real demand shows up.
- Ship one `claude` binary (arm64). Total SSD footprint for runtime: **~250 MB** (Claude Code ~213 MB + ripgrep + fswatch + assets).
- `manifest.json` tracks SHA-256 hash of every binary and script; installer verifies before first run.
- First run on a new Mac: Gatekeeper will quarantine unsigned binaries. Solutions by phase:
  - (Phase 1) README instructs one command: `xattr -dr com.apple.quarantine /Volumes/myhub`
  - (Phase 4) Notarize binaries with Developer ID (requires $99/yr Apple account) — removes the quarantine step entirely for public users.

**Why dropping x64:** User is on Apple Silicon, SSD will primarily live with Apple Silicon Macs. Shipping both doubles binary weight (~500 MB) and complicates the launcher for a near-extinct minority case. Easy to add back in v1.1 if there's demand.

---

## 12. Security Model

### 12.1 What we commit to
- **Zero host persistence beyond the trigger.** Only artifact on the Mac is `~/Library/LaunchAgents/com.myhub.mount.plist` (~1 KB). `uninstall.command` removes it.
- Manifest-verified launcher & scripts (SHA-256 in `manifest.json`).
- Trust-on-first-use per Mac: `install.command` requires explicit double-click + shows what's installing.
- All code runs under the user's own privileges — no elevation, no daemon.
- No API keys. OAuth token only (subscription-scoped, revocable).

### 12.2 What we accept (with informed user choice)
- **Unencrypted SSD.** Plug-and-go beats passphrase prompt. Implication: lost drive = leaked life-notes **plus** leaked Claude OAuth token (see §6.1 for revocation path and opt-in mitigations).
- **OAuth token in a file on the SSD** rather than host Keychain. This is the user's explicit "SSD autark" choice — the token travels with the drive so there's no per-Mac re-login.
- **No host-side trust dialog on subsequent mounts.** After the one-time `install.command` acceptance, mount-triggered actions run silently. Acceptable because the SSD is user-owned and scripts are manifest-verified.

### 12.3 What we don't do in v1 (but plan)
- Host denylist (don't run on corp Macs).
- `--safe-mode` flag (read-only, no network MCPs, no host writes) for untrusted machines.
- Code-signing with Developer ID.

### 12.4 What we loudly warn
- README prominently: "This drive runs code on any Mac it's installed on. Only install on machines you own."
- First-run dialog lists every path that will be modified on the host.
- `uninstall.command` fully reverses the install.

---

## 13. Public Repo Strategy (Parallel to Personal Use)

Repo: `github.com/<your-handle>/myhub` (public from day one).

### 13.1 What's in the repo
- All scripts, templates, installer, agent definitions, slash commands, CLI source.
- Empty `content/` skeleton with example `CLAUDE.md` templates.
- **No user data. Ever.** `content/`, `memory/`, and `.claude/.credentials.json` are `.gitignore`d.
- Release artifacts (on GitHub Releases): one tarball per release with bundled arm64 binaries.

### 13.2 Bootstrap flow for a new user
```
1. Plug a blank APFS-formatted SSD named "myhub" into a Mac
2. Download latest release tarball, extract to SSD root
   OR: curl -fsSL https://raw.githubusercontent.com/<user>/myhub/main/bootstrap.sh | bash
3. Double-click /Volumes/myhub/.boot/install.command (one-time per Mac)
4. Drop the SSD (cmd+E) → plug back in → sound plays, Jarvis greets you
5. /setup → name (60 seconds, that's it)
6. Drop some files into content/notes/, content/projects/
7. /compile → wiki materializes
```

### 13.3 Not in v1
- UI. Everything is terminal.
- Sync between multiple drives. One drive = one brain.
- Multi-user. Single human, single SSD.

---

## 14. Roadmap

### Phase 0 — Skeleton
- Reformat T7 from ExFAT → APFS, name volume `myhub`.
- Public GitHub repo `myhub`, MIT license, README skeleton.
- Directory scaffold generated from spec (all the empty dirs + template files).
- `manifest.json` generator script.

### Phase 1 — MVP that boots
- `install.command` + launchd plist + `on-mount.sh` (with sound + notification).
- `launcher.sh` setting `CLAUDE_CONFIG_DIR` and exec'ing `claude`.
- Bundled Claude Code binary (arm64).
- Root `content/CLAUDE.md` template (llms.txt-style map).
- Per-directory `CLAUDE.md` stubs.
- `/setup` slash command (asks name, writes to root CLAUDE.md).
- `terse` output style.
- `briefer` agent: minimal version (static template, no TTS yet).
- `session-start.sh` hook invokes briefer → prints greeting.
- **Ship-ready for author's own daily use. OAuth-on-SSD works across Macs.**

### Phase 2 — Voice & Memory
- TTS integration: `say -v Daniel` pipe from `session-start.sh`.
- `assets/connect.aiff` (Jarvis-flavored boot sound — pick or commission).
- `memory/MEMORY.md` + typed memory files scaffold.
- `/reflect` slash command: distills session into memory.
- `session-end.sh` hook: auto-reflect on non-trivial sessions.
- `briefer` upgraded: reads memory + git log + file diffs for real context.

### Phase 3 — Wiki Compiler (the Karpathy pattern)
- `compiler` agent full implementation.
- `content/wiki/` structure with people/projects/concepts/timeline subdirs.
- `/compile` and `/compile --since=` slash commands.
- `fswatch` watcher (background, during session): debounced auto-compile triggers.
- Wiki linking conventions: source backlinks, cross-article [[wikilinks]].
- `myhub compile --full` CLI for cold rebuild.

### Phase 4 — Public Release
- Polish README (GIF of plug-in → voice greeting, quickstart).
- `uninstall.command` (removes launchd plist cleanly from host).
- `manifest.json` + SHA-256 verification in installer.
- GitHub Actions release pipeline (build, package, publish tarball).
- Notarization path OR prominent `xattr` instruction in README.
- `--safe-mode` flag (read-only, no writes to host, no TTS) for untrusted Macs.
- Onboarding documentation: voice upgrade guide, CLAUDE.md authoring guide.

### Phase 5 — Scale (optional, only if needed)
- Opt-in `age`-encrypted subfolders for sensitive content.
- Tantivy BM25 index as additional MCP tool (zero ML cost, instant lexical search).
- LanceDB + Nomic Embed semantic layer (Ollama bundled) — *only* if wiki scale demands it.
- Piper TTS bundle for local cinematic voice.
- CLIP embeddings for photos, whisper.cpp transcripts for audio.
- Intel x64 binaries if demand materializes.

---

## 15. Decisions Resolved (v1 of spec)

| # | Decision | Resolution |
|---|---|---|
| A | Project name | **`myhub`** ✓ |
| B | SSD volume label | **`myhub`** (after reformatting T7 from ExFAT → APFS) ✓ |
| C | Sound on mount | Starter sound TBD; `say -v Daniel` voice greeting is the real centerpiece ✓ |
| D | Terminal app | **`Terminal.app`** (universal) ✓ |
| E | Encryption scope | **Unencrypted SSD** for MVP (user choice) ✓ |
| F | Architecture | **arm64-only** for MVP ✓ |
| G | Knowledge architecture | **Karpathy LLM Wiki pattern** (no Ollama, no vector DB in MVP) ✓ |
| H | GitHub repo | **Public from day one** ✓ |
| I | Auth | **OAuth token on SSD** via `CLAUDE_CONFIG_DIR` (log in once, works everywhere) ✓ |

### Remaining micro-decisions before Phase 0 starts
| # | Question | Recommended default |
|---|---|---|
| 1 | Reformat T7 (ExFAT → APFS) now? | **Yes.** ExFAT breaks symlinks, unix perms, git. Current 40 MB on drive is trivial. |
| 2 | Boot sound file | Ship Apple's `Glass.aiff` as placeholder; pick real one in Phase 2 (e.g., a short synthy "arc-reactor spin-up"). |
| 3 | TTS voice for MVP | **`Daniel`** (British male, Jarvis-flavored, ships with macOS) with upgrade docs pointing to Piper/ElevenLabs. |
| 4 | Repo URL | `github.com/<your-handle>/myhub` — confirm handle. |

---

## 16. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| macOS Gatekeeper blocks unsigned binaries on new Macs | High | Medium | README instructs `xattr -dr /Volumes/myhub`; Phase 4 notarize |
| Mount path collision (`/Volumes/myhub 1`) | Medium | Low | UUID-based path discovery in launcher |
| Wiki corruption / stale | Low | Low | Raw `content/` is ground truth; `/compile --full` always restores |
| TTS voice not installed on a new Mac | Medium | Low | Fallback to default system voice; voice download suggestion in README |
| User plugs into corp Mac by mistake | Low | High | Phase 4 safe-mode + host UUID allowlist |
| API costs from OAuth subscription limits | Medium | Low | User on Pro/Max; rate limits are Anthropic's, not ours |
| Lost SSD → OAuth token leak | Low-Medium | Medium | Subscription-scoped; immediate revoke via claude.ai; opt-in encryption in v1.1 |
| Spec drift between personal use and public repo | Medium | Medium | Single codebase, no personal branches; `content/` + `memory/` + `.credentials.json` in `.gitignore` |
| Compiler agent rewrites wiki poorly | Medium | Medium | All compile diffs reviewable in git; `/compile --dry-run`; raw files untouched |

---

## 17. Non-goals (explicit)

- Not a replacement for Obsidian / Notion / Apple Notes. Sits underneath.
- Not cloud-synced across machines. One drive is the canonical instance.
- Not a UI product. Terminal-native.
- Not a multi-tenant SaaS. Personal and portable.
- Not an LLM router. Uses Claude only (could become pluggable later, not now).

---

*End of spec v1. Next step: confirm 4 micro-decisions (§15), reformat T7 → APFS, then begin Phase 0.*
