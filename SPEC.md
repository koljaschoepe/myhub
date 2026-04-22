# SPEC — myhub

> **Codename:** `myhub` · **Target:** macOS 14+ (Apple Silicon only for MVP) · **License:** MIT · **Status:** Architecture spec v2, pre-implementation · **Repo:** [github.com/koljaschoepe/myhub](https://github.com/koljaschoepe/myhub) (public from day one)

A pluggable personal AI: stick in the drive, a TUI project hub boots in a terminal, a Jarvis-like voice greets you, and Claude Code is one keystroke away in any of your projects — with full context already loaded.

---

## 0. What Changed in v2

v2 inserts a **TUI project hub** between "SSD mount" and "Claude Code session." v1 had the launcher `exec` Claude directly. v2 launches `myhub-tui` (Bubble Tea, Go), which shows the Jarvis greeting, a list of SSD-resident projects, and per-project status. Claude Code is launched as a child process via `tea.ExecProcess` — when you Ctrl-D out of Claude, you return to the hub.

Driver: the v1 flow was great for one project but didn't scale to the reality of a vault with many parallel projects. The TUI also gives us a place to render richer status (git, recent activity, unread deltas) and to host a first-class **Interview primitive** for structured onboarding and wizards — a principle applied everywhere in this project (see §2.8, §12).

Inspiration: [OpenAra](https://github.com/koljaschoepe/OpenAra) — sibling project with the same TUI-launcher pattern for ARM64 headless servers. Port the registry + exec-launch patterns, inherit the visual identity, skip the Python/Linux-specific bits.

---

## 1. Vision

**One sentence:** Plug in an SSD, a terminal opens, your personal AI hub greets you with today's context and all your projects — pick one, and Claude Code drops into it with the right memory and CLAUDE.md already loaded.

**What it is:**
- A portable filesystem layout that bundles Claude Code, its config, your content, and a TUI project hub into a single drive.
- An install-once-per-Mac launchd hook that, on SSD mount, plays a sound, shows a notification, opens a terminal tab, and runs the `myhub` TUI — which renders a proactive greeting, lists your projects, and launches Claude Code on demand.
- A self-maintaining markdown wiki (Karpathy-style) over everything on the drive, navigable by Claude via native Read/Grep/Glob tools. No vector DB in v1.
- A layered context system (global `CLAUDE.md`, per-domain `CLAUDE.md`, persistent memory) that adapts to the user over time.
- A first-class **Interview primitive** — every decision point (onboarding, project creation, auth, wizards) is a structured multi-choice question, never a blank text prompt.
- A minimal agent scaffold — infrastructure exists, but only 2 opinionated agents ship; the rest the user grows organically.

**What it is not:**
- Not a cloud service. Embeddings are local, files are local, state is local.
- Not a replacement for a PKM app. It sits *underneath* whatever you use.
- Not opinionated about your workflow. Minimal scaffolding, max adaptivity.
- Not a terminal emulator. It's a TUI that runs inside Terminal.app.

---

## 2. Design Principles

1. **The SSD is the source of truth.** Anything on the host Mac is a cache or a trigger — never state. You lose the drive, you lose the whole system; you lose the Mac, you lose nothing.
2. **Rohdaten immer menschenlesbar.** Your files stay as plain files. Indices and wikis can be rebuilt from them. Never trap the user's data behind the tool.
3. **Clean over clever.** Short answers, no redundant context, no pre-baked opinions. The user's own `CLAUDE.md` and memory are the only persona layer.
4. **Adaptive, not prescriptive.** Learn from what the user writes and does. Never hardcode workflow assumptions.
5. **Zero host footprint except the trigger.** One tiny launchd plist per Mac. Everything else runs from the drive.
6. **Reliable over fancy.** Graceful degradation at every layer: if briefer fails, static greeting; if Claude binary missing, exact fix command; if memory corrupts, backup + reset.
7. **Proactive on mount.** First thing the user sees is a context-aware greeting — never a blank prompt, never an empty dashboard.
8. **Structured questions, not blank prompts.** Every decision point in the UI — onboarding, project creation, auth flows, `/setup`, `/compile` variants, any wizard — surfaces as a finite set of labeled options. Free-text input is the escape hatch, not the default. Applies to the TUI, to slash commands, and to any agent that needs user input (via the Interview primitive, §12).
9. **Single-key ergonomics in the hub.** Numbered selection, letter hotkeys, fuzzy match — in that order of preference. Mouse is never required.
10. **Hub is stateless-ish.** The TUI reads projects from the filesystem on every mount; state it persists (cursor, last-opened-at, brief cache) is a convenience, never load-bearing.

---

## 3. System Architecture (Stack Overview)

```
┌────────────────────────────────────────────────────────────────────┐
│ LAYER 5 · INTERACTION                                              │
│  myhub-tui (Bubble Tea · Go)  ← mount entrypoint                   │
│    · proactive briefer panel  · project list · interview primitive │
│  Claude Code CLI  ← launched per project via tea.ExecProcess       │
├────────────────────────────────────────────────────────────────────┤
│ LAYER 4 · PERSONA / CONTEXT                                        │
│  root CLAUDE.md · per-domain CLAUDE.md · memory/ · agents/         │
├────────────────────────────────────────────────────────────────────┤
│ LAYER 3 · INTELLIGENCE                                             │
│  briefer agent · compiler agent · session hooks · skills           │
├────────────────────────────────────────────────────────────────────┤
│ LAYER 2 · KNOWLEDGE                                                │
│  content/wiki/ (compiled markdown · Karpathy LLM Wiki pattern)     │
│  content/CLAUDE.md (llms.txt-style root map, auto-loaded)          │
├────────────────────────────────────────────────────────────────────┤
│ LAYER 1 · RAW CONTENT                                              │
│  content/notes, content/projects, content/communication            │
├────────────────────────────────────────────────────────────────────┤
│ LAYER 0 · RUNTIME                                                  │
│  Claude Code binary · myhub-tui binary · fswatch (optional)        │
└────────────────────────────────────────────────────────────────────┘
         ▲
         │ triggered by
         │
┌────────────────────────────────────────────────────────────────────┐
│ HOST: launchd LaunchAgent (StartOnMount) → on-mount.sh on SSD      │
│       play sound · notify · open Terminal · cd · exec myhub-tui    │
└────────────────────────────────────────────────────────────────────┘
```

No LanceDB, no Tantivy, no Ollama in MVP. Wiki-based retrieval (see §8). All state that matters lives on the SSD.

---

## 4. Filesystem Layout

```
/Volumes/myhub/                      ← the SSD (volume label chosen once)
│
├── .boot/                           ← anything needed BEFORE the TUI starts
│   ├── install.command              ← double-click once per Mac; installs launchd hook
│   ├── uninstall.command            ← removes launchd hook from current Mac
│   ├── on-mount.sh                  ← invoked by launchd on mount; orchestrates boot
│   ├── launcher.sh                  ← arch-detects, sets env, execs myhub-tui
│   ├── plist.template               ← LaunchAgent plist (paths substituted at install)
│   ├── preflight.sh                 ← checks claude binary, config, state files
│   ├── trusted-hosts.json           ← .gitignored; per-Mac UUID allowlist
│   ├── dashboard-state.json         ← .gitignored; TUI cursor, last-opened, brief cache
│   └── assets/
│       ├── connect.aiff             ← "AI connected" sound
│       └── icon.icns                ← drive icon
│
├── bin/                             ← all runtimes live here; host needs nothing
│   ├── claude                       ← Claude Code binary (arm64)
│   ├── myhub-tui                    ← the hub TUI (Bubble Tea, static arm64 ~12 MB)
│   ├── myhub                        ← thin CLI wrapper (maintenance commands)
│   ├── rg                           ← ripgrep (optional)
│   └── fswatch                      ← filesystem watcher (for compile triggers)
│
├── myhub-tui/                       ← GO SOURCE for the TUI (committed to repo)
│   ├── cmd/myhub-tui/main.go        ← entry point
│   ├── cmd/myhub/main.go            ← CLI wrapper
│   ├── internal/
│   │   ├── ui/                      ← Bubble Tea models (dashboard, detail, interview)
│   │   ├── theme/                   ← Lipgloss palette + glyphs (OpenAra-inherited)
│   │   ├── projects/                ← registry (YAML) + atomic write + git info
│   │   ├── briefer/                 ← headless `claude -p` invocation for greeting
│   │   ├── interview/               ← structured-question primitive (§12)
│   │   └── launch/                  ← tea.ExecProcess wrapper for Claude
│   ├── go.mod
│   └── Makefile                     ← `make build` → bin/myhub-tui
│
├── .claude/                         ← CLAUDE_CONFIG_DIR points here
│   ├── settings.json                ← permissions, hooks
│   ├── agents/
│   │   ├── briefer.md               ← bake-in #1 — generates on-mount greeting
│   │   └── compiler.md              ← bake-in #2 — maintains the wiki
│   ├── skills/                      ← empty scaffold; user grows over time
│   ├── commands/
│   │   ├── setup.md                 ← /setup — minimal onboarding via interview primitive
│   │   ├── brief.md                 ← /brief — regenerate greeting mid-session
│   │   ├── reflect.md               ← /reflect — distill session → memory
│   │   └── compile.md               ← /compile — force wiki recompile
│   ├── hooks/
│   │   ├── session-start.sh         ← per-project memory load (slimmed vs v1)
│   │   └── session-end.sh           ← calls compiler agent + writes memory delta
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
│   ├── projects/                    ← one subdir per project; TUI lists these
│   │   ├── CLAUDE.md                ← shared context for all projects
│   │   └── <project-slug>/
│   │       ├── CLAUDE.md            ← per-project context
│   │       ├── .myhub-project.toml  ← optional: display name, icon, custom agents
│   │       └── ...                  ← whatever the project is (code, notes, docs)
│   └── communication/
│       └── CLAUDE.md                ← context for parsing chat/email archives
│
├── memory/                          ← self-learning layer (persistent across sessions)
│   ├── MEMORY.md                    ← index of memory files (always loaded)
│   ├── user/                        ← what we've learned about the user
│   ├── feedback/                    ← corrections/confirmations over time
│   ├── patterns/                    ← recurring themes, preferred workflows
│   ├── sessions/                    ← compressed session logs (rolling retention)
│   └── projects.yaml                ← project registry (see §7.4)
│
├── manifest.json                    ← SHA-256 of every script + binary
├── README.md                        ← "Stecke ein. Werde KI."
├── LICENSE                          ← MIT
├── SPEC.md                          ← this file
└── VERSION
```

**Why this layout:**
- `content/` is pristine and portable — you could `cp -r` it into any other tool.
- `memory/` mirrors Claude Code's own memory pattern (MEMORY.md index + typed files); project registry lives here too, right next to the memory it's closest in spirit to.
- `myhub-tui/` is the only source checked into git besides spec/docs. Binary ships via Releases; source stays public and auditable.
- `.claude/` is a standard Claude Code config dir, just relocated.
- `.boot/` and `bin/` are implementation details the user rarely touches.

---

## 5. Boot & Mount Sequence

### 5.1 First time on a new Mac
```
1. User plugs in SSD → Finder shows "myhub" mounted at /Volumes/myhub
2. User double-clicks /Volumes/myhub/.boot/install.command (once, ever, per Mac)
3. install.command:
   - runs manifest verification (SHA-256 of all scripts + binaries)
   - shows a trust dialog listing what's about to install
   - copies plist.template → ~/Library/LaunchAgents/com.myhub.mount.plist
     (with VOL_LABEL = "myhub")
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
            ├─ shows notification "myhub connected" via osascript
            ├─ runs preflight.sh (binaries OK? config readable? memory dir present?)
            └─ opens Terminal.app via AppleScript:
                  cd /Volumes/myhub && ./.boot/launcher.sh
```

### 5.3 The launcher
```bash
# /Volumes/myhub/.boot/launcher.sh (simplified)
MYHUB="$(cd "$(dirname "$0")/.." && pwd)"
export CLAUDE_CONFIG_DIR="$MYHUB/.claude"
export CLAUDE_CODE_PLUGIN_CACHE_DIR="$MYHUB/.claude/plugins"
export MYHUB_ROOT="$MYHUB"
export PATH="$MYHUB/bin:$PATH"

# hand off to the TUI — which will exec Claude Code later on-demand
cd "$MYHUB"
exec "$MYHUB/bin/myhub-tui"
```

**Latency target:** mount → TUI visible and greeting rendered ≤ 2 seconds. Claude Code session ready ≤ 1 second after the user selects a project (most of the ~1s is Claude Code's own startup).

### 5.4 Mid-session flow
```
User is in Claude Code for project-X.
  │
  ▼
User Ctrl-D (or types "/exit") → Claude exits cleanly.
  │
  ▼
Bubble Tea's ExecProcess callback fires → TUI redraws.
  │
  ▼
Welcome-back panel: "Zurück. X-Session endete um HH:MM.
   Briefer hat 2 neue Themen registriert. Weiter mit Projekt Y?"
  │
  ▼
User picks next project — or Ctrl-D out of TUI to return to shell.
```

This is the key v2 improvement: **Claude exit returns to the hub, not to an empty shell.**

---

## 6. Auth Model

**Decision: Claude Pro/Max OAuth, credentials stored *on the SSD*.**

Guiding principle: **the Mac is pure compute. Nothing auth-related touches the host.**

Mechanics:
- Launcher sets `CLAUDE_CONFIG_DIR=/Volumes/myhub/.claude` *before* exec'ing `myhub-tui`. The TUI inherits the env var; every `claude` child process sees it.
- Claude Code on macOS normally stores OAuth tokens in the system Keychain — but when `CLAUDE_CONFIG_DIR` is set, tokens land in `${CLAUDE_CONFIG_DIR}/.credentials.json` with mode 0600.
- First-ever launch (on any Mac): hub detects no token, shows a first-run interview panel (§12) asking the user to run `claude auth` / pick an OAuth flow. Token written to the SSD.
- Every subsequent launch (same Mac, different Mac, doesn't matter): token is already on the SSD → zero-friction, zero login.
- Anthropic's OAuth tokens are **not device-bound**, so the same token works across Macs.

Flow-of-secrets summary:
| Artifact | Lives on |
|---|---|
| OAuth refresh token | `/Volumes/myhub/.claude/.credentials.json` (SSD) |
| macOS Keychain entry | — (never written) |
| Host-side config files | — (only the launchd stub in `~/Library/LaunchAgents/`) |

### 6.1 Risk accepted with this choice
- **Lost/stolen SSD** → finder has your Claude subscription access until the token expires or you revoke it via `claude.ai/settings/connected-apps`. Bounded: subscription rate limits cap damage; Pro/Max is a flat fee so no bill shock.
- **Unencrypted SSD** (per §17) compounds this: credential file is readable without auth. Mitigation options you can opt into later without changing the architecture:
  - (a) Flip `content/communication/` (the most sensitive subfolder) into an `age`-encrypted bundle.
  - (b) Full APFS-encrypt the volume — one passphrase on mount.
  - (c) `age`-encrypt just `.credentials.json` with a short passphrase prompted by the TUI at launch.
- Revocation path: if SSD is lost, user logs in at claude.ai and revokes the OAuth app. Mention prominently in README.

### 6.2 What this buys
True isolation. You take out the drive, walk to any Mac, plug in, and the same personal AI — same memory, same files, same auth — is there in ~2 seconds. The laptop contributes CPU and screen; nothing else.

---

## 7. TUI Architecture — the Hub Layer

The TUI is the user's front door. It's what mount produces; Claude Code is what it *dispatches* to.

### 7.1 Stack

- **Language:** Go (static binary, no runtime deps on the SSD).
- **Framework:** Bubble Tea v2 (Elm-style MVU) — https://github.com/charmbracelet/bubbletea
- **Components:** Bubbles (list, textinput, viewport, spinner) — https://github.com/charmbracelet/bubbles
- **Styling:** Lipgloss v2 (compositor for layered panes) — https://github.com/charmbracelet/lipgloss
- **Binary target:** `arm64` static Mach-O, `~10–12 MB`, built with `CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build`.

### 7.2 Layout

Dashboard (main screen), ~80 cols wide by default, responsive to terminal size:

```
╭─────────────────────────────────────────────────────────────────╮
│  ░░▒▒▓▓  myhub  ▓▓▒▒░░           Guten Abend, Kolja.            │   ← header
│  v0.1.0 · host: air · 2026-04-22 22:14                          │
╰─────────────────────────────────────────────────────────────────╯

╭─ today ─────────────────────────────────────────────────────────╮
│  Freitag hattest Du SPEC v2 geschrieben.                        │   ← briefer panel
│  3 neue Notizen in content/notes, Projekt ara: 2 Commits.       │   (loads async)
│  Offener Faden: TUI Interview-Primitive.                        │
╰─────────────────────────────────────────────────────────────────╯

  projects (↑↓ move · enter open · c claude · g git · n new · d del)
  [1]  ara           main    ✓    2h ago
  [2]  myhub         main    *    12m ago
  [3]  thesis        main    ✓    4d ago
  [4]  private-blog  draft   *    1w ago

  > _                                                              ← prompt

[q]uit · [h]elp · [/] command
```

- **Header panel:** ASCII logo (gradient-colored, OpenAra's palette inherited), time-aware greeting, version + host + timestamp.
- **Briefer panel** ("today"): starts empty with a subtle spinner; filled 2–4s after boot by the `briefer` agent (§10). If briefer fails, panel shows static fallback ("N raw files changed since last mount").
- **Project list:** numbered (1–9 single-key open; 0 means "more"), per-row: name, current git branch, dirty flag (`*`/`✓`), last-commit relative time. Cursor highlight for arrow-key nav.
- **Prompt line:** user can type a number, a letter command, or `/`-prefixed slash command. Fuzzy project name match as tertiary fallback.
- **Status line:** always shows keymap hints. Adapts to context (inside a wizard: shows step N/M).

Responsive tiers (OpenAra-inherited): `FULL ≥ 78 cols`, `MEDIUM 60–78`, `COMPACT < 60`. In compact tier, briefer panel collapses to one line and project list drops the relative-time column.

### 7.3 Screens

Two screens. Explicit `Screen` enum — no hidden modes.

- **`ScreenMain`** — dashboard (above).
- **`ScreenProject`** — entered when user selects a project and doesn't immediately launch Claude (e.g., picks "info" instead of "claude"). Shows project-scoped detail: branch, recent commits, open memory threads for this project, CLAUDE.md preview. Keymap: `c`=launch claude, `g`=lazygit (if installed on host), `e`=edit CLAUDE.md, `r`=rename, `d`=delete, `b`=back.

Wizards (onboarding, `/setup`, project creation, confirm-delete) render as **modal overlay** over whichever screen is active. They use the Interview primitive (§12) to present options.

### 7.4 Project registry

Persisted in `memory/projects.yaml`. Schema:

```yaml
projects:
  - name: ara
    path: content/projects/ara
    display_name: "Project Ara"           # optional; falls back to name
    created_at: 2026-02-14T09:12:00Z
    last_opened_at: 2026-04-22T20:33:00Z  # updated on every Claude launch
    favorite: false
    archived: false
    git_remote: git@github.com:koljaschoepe/ara.git   # auto-detected
    provider_default: claude              # future: could be "codex" etc.
```

- **Primary source** is the filesystem: every subdir of `content/projects/` with a `CLAUDE.md` (or `.myhub-project.toml`) is a project.
- **Registry** adds ephemeral/meta state (cursor position, last_opened_at, favorite, archived) and caches auto-detected bits (git_remote).
- **Atomic write** (OpenAra pattern): write to `projects.yaml.tmp` in same dir → `chmod 0o600` → `os.Rename`.
- **Corrupt-YAML self-heal:** on parse error, move to `projects.yaml.bak.<timestamp>`, regenerate from filesystem scan, log one line.
- **No SQLite, no DB.** Single YAML file, human-editable from any editor on the SSD.

### 7.5 Claude launch (the key interaction)

When the user selects a project and hits `c` or Enter:

```go
// pseudocode — internal/launch/launch.go
cmd := exec.Command("claude")
cmd.Dir = filepath.Join(myhubRoot, "content/projects", projectSlug)
cmd.Env = append(os.Environ(),
    "CLAUDE_CONFIG_DIR="+filepath.Join(myhubRoot, ".claude"),
    "MYHUB_ROOT="+myhubRoot,
    "MYHUB_PROJECT="+projectSlug,
)
return tea.ExecProcess(cmd, onClaudeExit)
```

`tea.ExecProcess`:
1. Tears down Bubble Tea's alt-screen and releases the TTY.
2. Runs `claude` with inherited stdio — Claude Code renders normally, full-screen, exactly as if launched from shell.
3. On Claude exit (Ctrl-D, `/exit`, crash), Bubble Tea re-establishes alt-screen and fires `onClaudeExit(err)`.
4. `onClaudeExit` updates `last_opened_at`, invalidates the brief cache, triggers a background re-brief, and redraws the dashboard with a "welcome back" panel.

**Why this model** (confirmed decision): preserves the hub as the stable entry point. OpenAra's `execvp` model is simpler but loses the hub context. `tea.ExecProcess` is literally built for this.

### 7.6 Keymap (global)

| Key | Action |
|---|---|
| `1–9` | Open Nth project (detail screen) |
| `c` | Launch Claude in current / selected project |
| `g` | Launch lazygit in current / selected project (if installed) |
| `n` | New project (wizard) |
| `d` | Delete project (confirm wizard) |
| `r` | Rename project (wizard) |
| `↑ / ↓ / j / k` | Move cursor |
| `/` | Open command palette |
| `:` | Same as `/` (vim-friendly) |
| `b / Esc` | Back / close modal |
| `?` | Help overlay |
| `q / Ctrl-D` | Quit hub (returns to shell) |

Fuzzy project-name match: typing `myh` at the prompt matches `myhub`. Cascade: exact → prefix → substring → char-scan (OpenAra's `_fuzzy_match`, ~30 lines Go).

### 7.7 Theme

Inherited verbatim from OpenAra (https://github.com/koljaschoepe/OpenAra/blob/main/arasul_tui/core/theme.py):

- **Logo gradient:** `#00d4ff → #10c0ff → #20acff → #3098ff → #4088ff → #4c7cff → #5870ff` (blue→cyan vertical wash).
- **Semantic colors:** primary `cyan`, success `green + ✓`, warning `yellow + ~`, error `red + ✗`, dim for meta.
- **Glyphs:** `▰▱` bars, `●○` dots, `·` separator, `→` arrows, `─` hlines.
- **Borders:** rounded (`╭╮╰╯│─`) in dim color; sharp (`┌┐└┘│─`) for focused panel.
- **Max width 84 cols; min 50. Left pad 4.**

### 7.8 State persistence

Three files:

- `memory/projects.yaml` — the registry (see §7.4).
- `.boot/dashboard-state.json` — ephemeral TUI state: cursor index, last-selected project, brief cache (`{brief_text, generated_at}`), view mode. Rebuilt on first mount if missing. `.gitignore`d.
- `.boot/trusted-hosts.json` — per-Mac UUIDs that have run `install.command`. `.gitignore`d.

---

## 8. Knowledge Architecture — the LLM Wiki Pattern

> **Architectural pivot from v0.** Originally planned as LanceDB + Tantivy + Ollama (RAG stack). Replaced with the [Karpathy LLM Wiki pattern](https://venturebeat.com/data/karpathy-shares-llm-knowledge-base-architecture-that-bypasses-rag-with-an/) + [llms.txt](https://llmstxt.org/) navigation. Simpler, zero ML runtime, and measurably better per Answer.AI / Karpathy for personal-scale corpora. RAG stays on the roadmap as Phase 5, to be added *only* if we hit a real limit.

### 8.1 Core idea
The knowledge base IS the markdown. A `compiler` agent reads your raw files and maintains an evolving, interlinked wiki in `content/wiki/`. Claude Code auto-loads the root `content/CLAUDE.md` (an llms.txt-style map) at every session start, then navigates into the wiki and raw content using its native Read/Grep/Glob tools. Retrieval = navigation, not embeddings.

### 8.2 Why this wins at personal scale
- **Context-window math:** Opus 1M holds ~750k tokens of content. A focused personal wiki fits whole. No retrieval noise.
- **Zero infrastructure:** No Ollama, no LanceDB, no Tantivy, no SQLite, no separate MCP server, no index rebuild cycle. Just markdown files.
- **Human-readable:** Git-diffable. Fully portable. Corruption-proof (source files are ground truth).
- **Self-improving:** Every compile pass makes the wiki tighter. Duplicates collapse, cross-references densify.
- **Zero ML cost:** No embedding model to download, version, or re-run.

### 8.3 Navigation flow (when you ask a question)
```
User in Claude session: "Was hatte ich letztes Jahr mit Projekt X besprochen?"
   │
   ▼
Claude has content/CLAUDE.md already loaded (root map)
   ▼
Claude identifies: "Projekt X" → wiki/projects/projekt-x.md
   ▼
Claude reads wiki/projects/projekt-x.md (compiled article)
   ▼
Needs specifics → follows [source: communication/slack-2024-...] link
   ▼
Claude.Read on the raw file, grabs exact quote
   ▼
Answers with citation.
```

No embeddings queried. No index service. Just file reads on a local SSD (µs-scale).

### 8.4 The compiler agent
`.claude/agents/compiler.md` is invoked:
- **On command**: `/compile` (full recompile) or `/compile --since=2d` (incremental).
- **On session end**: `SessionEnd` hook fires it if the session modified `content/`.
- **On file drop**: during session, `fswatch` watches `content/notes`, `content/projects`, `content/communication` with a 30s debounce; queues changed files.

What it does each pass:
1. Enumerates changed raw files since last compile (tracked in `memory/compile-state.json`).
2. For each: decides *new article? update existing? merge duplicates? archive as stale?*
3. Writes/edits `content/wiki/*.md` via Claude's own Write/Edit tools.
4. Updates `content/CLAUDE.md` root map if a new category emerges.
5. Maintains cross-reference links: `[[wikilinks]]` between articles, source backrefs to raw.
6. Never modifies raw source files.
7. Writes a 3-line compile-log to `memory/sessions/`.

### 8.5 Failsafe
- `myhub compile --full` re-derives the entire wiki from raw. Idempotent.
- Wiki corruption = no real loss. Raw content is ground truth.
- `myhub health` verifies manifest hashes + wiki/source link integrity.

### 8.6 When to add RAG (Phase 5, possibly never)
Trigger signals: wiki > ~200k tokens; repeated wiki-navigation misses; "find everything about X" needing too many roundtrips. Then add Tantivy BM25 first, LanceDB + Nomic Embed second. Wiki stays primary; RAG becomes a search tool Claude reaches for when navigation fails.

---

## 9. Context & Persona System

Three concentric rings, merged by Claude Code at session start:

### 9.1 Root persona — `content/CLAUDE.md`
Hand-written by the user over time (grows with `/setup` then organically). Template stub:
```markdown
# Who I am
Name: <filled by /setup>

# How I work
(empty; populated by /reflect over time)

# What I care about
(empty; populated over time)
```

### 9.2 Domain context — `content/*/CLAUDE.md`
Each top-level content directory has its own CLAUDE.md for local context. Example `content/communication/CLAUDE.md`:
```markdown
# Communication archive
- notes/whatsapp/  : WhatsApp exports, JSON, one file per chat
- notes/email/     : mbox files per account, personal + work separate
Always cite message timestamps when referencing.
```

### 9.3 Persistent memory — `memory/`
Mirrors the Claude Code memory pattern. `MEMORY.md` is the always-loaded index; typed memory files (`user_*.md`, `feedback_*.md`, `pattern_*.md`) live in subdirs.

- Written automatically by `/reflect` command + `session-end.sh` hook.
- Read at every session start via Claude Code's own memory-access mechanism.

**Rule:** memory is *additive and corrective*. Never bulk-rewrite. Dedupe by grep against memory/ itself.

---

## 10. Proactive On-Mount Behavior — the Jarvis Moment, TUI-Edition

v2 flow: **hybrid** (immediate simple greeting + async briefer panel + TTS when brief is ready).

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
          launcher.sh exports env, execs myhub-tui
                │
                ▼
          TUI renders IMMEDIATELY (≤ 200 ms):
            · header with time-aware greeting ("Guten Abend, Kolja")
            · project list from filesystem scan
            · "today" panel shows spinner: "Briefer läuft…"
                │
                ├─→ fork: `claude -p --agent briefer` subprocess (headless)
                │         stdin:  JSON context (memory/MEMORY.md summary,
                │                 git log --since=last_mount, file deltas)
                │         stdout: 2–5 line greeting, JSON
                │
                ▼
          Briefer returns after 2–4 s:
            · TUI redraws "today" panel with brief text
            · `say -v Daniel "$brief" &` runs async (skipped if MYHUB_TTS=0)
                │
                ▼
          User sees/hears proactive briefing, picks a project → Claude
```

### 10.1 The greeting (no blank panel, ever)

**Immediate (t=0):**
```
Guten Abend, Kolja.
```
(via `greetByHour()` — 4-line Go helper: morning/afternoon/evening/late-session/still-up.)

**After briefer (t=2–4 s):**
```
Guten Abend, Kolja.
Freitag hattest Du SPEC v2 geschrieben.
Übers Wochenende 12 neue Notizen in /research, Projekt ara: 4 Commits.
Offener Faden: Reformatierung T7 auf APFS.
```

TTS reads the full brief when ready. The *user is already interacting* with the project list by that point — TTS is audio context, not a blocker.

### 10.2 Voice control
- **Default voice: `Daniel`** (British male, ships with macOS).
- Configurable in `memory/config.toml` → `tts.voice`. Any `say -v '?'` voice works.
- Upgrade paths (documented in `docs/voice.md`, Phase 2+):
  - Premium neural voices (download via Systemeinstellungen > Barrierefreiheit > Gesprochene Inhalte).
  - Piper TTS (local, offline, cinematic — recommended v2 upgrade, bundled on SSD).
  - ElevenLabs (cloud, paid, true Jarvis-level).
- Kill-switch: `MYHUB_TTS=0` env var or `tts.enabled=false` in config.
- TTS runs async; TUI never waits on it.

### 10.3 Reliability safeguards
- If `briefer` errors → static fallback ("N raw files changed since last mount; Projekt X berührt") computed in Go from filesystem scan. TUI never shows an error panel to the user.
- If `say` missing → silent fallback, no crash.
- If `memory/MEMORY.md` missing → first-time user flow, TUI shows onboarding modal via Interview primitive.
- If `claude` binary missing → TUI shows a big fix-command panel and a retry button.

---

## 11. Slash Commands, Agents, Hooks

### 11.1 Ship-with slash commands (4)
- **`/setup`** — one-time onboarding. Interview-primitive wizard: name, preferred language, TTS on/off, default editor. Writes to `content/CLAUDE.md` + `memory/config.toml`. < 60 seconds.
- **`/brief`** — regenerate the proactive briefing mid-session (invokes briefer headlessly, prints to Claude's stdout).
- **`/reflect`** — distills just-ended session into 0–3 new memory entries.
- **`/compile`** — force a wiki compile pass (`/compile --since=2d` for incremental, `/compile --full` for rebuild).

Everything else the user creates.

### 11.2 Ship-with agents (2)
- **`briefer`** — the on-mount greeter (§10). Callable two ways:
  - Headlessly from the TUI (`claude -p --agent briefer` on mount).
  - Interactively via `/brief` slash command inside a Claude session.
- **`compiler`** — the wiki maintainer (§8.4). Invoked by `/compile`, `SessionEnd` hook, and `fswatch` triggers. Reads changed raw files, updates `content/wiki/*.md`, prunes stale articles, maintains root `content/CLAUDE.md` map.

No research-assistant, code-reviewer, writing-coach — user grows those when *they* need them. **Framework exists, content doesn't.**

### 11.3 Ship-with hooks
- `SessionStart` → runs `session-start.sh`: loads project-local memory if `MYHUB_PROJECT` is set. (Slimmed vs v1: greeting generation moved to TUI.)
- `SessionEnd` → runs `session-end.sh`: runs `compiler` if `content/` was touched, writes memory delta via `/reflect`-equivalent logic. Updates `last_opened_at` in `projects.yaml`.
- `PostToolUse` on Write/Edit inside `content/` (excluding `content/wiki/`) → enqueues changed file for next `compiler` pass.

---

## 12. Interview Component — Structured Questions Everywhere

### 12.1 Principle
Per design principle §2.8, **every user decision point surfaces as a structured multi-choice question.** This is mirrored across three runtime surfaces:

| Where | Implementation | Example |
|---|---|---|
| **TUI** | Bubble Tea overlay component (`internal/interview/`) — arrow-key nav + Enter to select, `o` to open free-text "other" | `/setup` onboarding, new-project wizard, confirm-delete, first-run auth |
| **Agents / slash commands** | Markdown-defined question block in the agent's output; TUI (if running) parses and renders; Claude session (if no TUI) falls back to formatted inline options | `/setup`, `/compile` picks wiki scope, `briefer` asks preferred follow-up |
| **CLI (`myhub` binary)** | `myhub ask <question-file.yaml>` — reads a question YAML, prints labeled options, reads selection | maintenance scripts, install flow |

### 12.2 Contract (JSON, used everywhere)
```json
{
  "version": 1,
  "question": "Wie soll X sein?",
  "header": "X-Konfiguration",
  "multi_select": false,
  "allow_custom": true,
  "options": [
    {
      "label": "Option 1",
      "description": "Was das bedeutet.",
      "recommended": true
    },
    {
      "label": "Option 2",
      "description": "Alternative."
    }
  ]
}
```

Mirrors Claude Code's `AskUserQuestion` tool shape (deliberate — the user has internalized that UX; keep it consistent).

### 12.3 Response (JSON)
```json
{
  "version": 1,
  "selected": ["Option 1"],
  "custom": null,
  "answered_at": "2026-04-22T22:14:31Z"
}
```

### 12.4 TUI rendering
Overlay modal, centered, ~60 cols wide. Keymap: `↑↓` move, `space` toggle in multi-select, `Enter` submit, `o` open free-text override, `Esc` cancel (where cancellable). Status line shows step N/M for multi-step wizards.

### 12.5 Why this is in the spec
Without this being a first-class component, every wizard/flow would invent its own input pattern. The consistency is the UX payoff. User feedback was explicit and emphatic: "das soll immer überall eingebaut werden in jedes einzelne Framework, was wir bauen."

---

## 13. Architecture Target (simplified)

- **Apple Silicon only** (arm64) for v1. Intel x64 support is a post-v1 backlog item if real demand shows up.
- Ship one `claude` binary + one `myhub-tui` binary (arm64). Total SSD footprint for runtime: **~260 MB** (Claude Code ~213 MB + myhub-tui ~12 MB + ripgrep + fswatch + assets).
- `manifest.json` tracks SHA-256 hash of every binary and script; installer verifies before first run.
- First run on a new Mac: Gatekeeper will quarantine unsigned binaries. Solutions by phase:
  - (Phase 1) README instructs one command: `xattr -dr com.apple.quarantine /Volumes/myhub`
  - (Phase 4) Notarize binaries with Developer ID ($99/yr Apple account).

**Why dropping x64:** Apple Silicon is the SSD's primary habitat. Doubling binary weight for a near-extinct minority case isn't worth it. Add back in v1.1 if there's demand.

---

## 14. Security Model

### 14.1 What we commit to
- **Zero host persistence beyond the trigger.** Only artifact on the Mac is `~/Library/LaunchAgents/com.myhub.mount.plist` (~1 KB). `uninstall.command` removes it.
- Manifest-verified launcher, scripts, and `myhub-tui` binary (SHA-256 in `manifest.json`).
- Trust-on-first-use per Mac: `install.command` requires explicit double-click + shows what's installing.
- All code runs under the user's own privileges — no elevation, no daemon.
- No API keys. OAuth token only (subscription-scoped, revocable).
- Go binary treats all user-controlled strings as untrusted — no `shell=True` equivalent, only `exec.Command("git", args...)` with string-array args.

### 14.2 What we accept (with informed user choice)
- **Unencrypted SSD.** Plug-and-go beats passphrase prompt. See §6.1 for revocation path and opt-in mitigations.
- **OAuth token in a file on the SSD** rather than host Keychain. Explicit "SSD autark" choice.
- **No host-side trust dialog on subsequent mounts.** After one-time `install.command` acceptance, mount-triggered actions run silently. Scripts + binaries manifest-verified.

### 14.3 What we don't do in v1 (but plan)
- Host denylist (don't run on corp Macs).
- `--safe-mode` flag (read-only, no host writes) for untrusted machines.
- Code-signing with Developer ID.

### 14.4 What we loudly warn
- README prominently: "This drive runs code on any Mac it's installed on. Only install on machines you own."
- `install.command` first-run dialog lists every path that will be modified on the host.
- `uninstall.command` fully reverses the install.

---

## 15. Public Repo Strategy

Repo: [github.com/koljaschoepe/myhub](https://github.com/koljaschoepe/myhub) — public from day one, MIT licensed.

### 15.1 What's in the repo
- All scripts, templates, `myhub-tui` Go source, installer, agent definitions, slash commands.
- Empty `content/` skeleton with example `CLAUDE.md` templates.
- **No user data. Ever.** `content/`, `memory/`, `.claude/.credentials.json` are `.gitignore`d.
- Release artifacts (GitHub Releases): tarball per release with bundled arm64 binaries.

### 15.2 Bootstrap flow for a new user
```
1. Plug a blank APFS-formatted SSD named "myhub" into a Mac
2. Download latest release tarball, extract to SSD root
   OR: curl -fsSL https://raw.githubusercontent.com/koljaschoepe/myhub/main/bootstrap.sh | bash
3. Double-click /Volumes/myhub/.boot/install.command (one-time per Mac)
4. Drop the SSD (cmd+E) → plug back in → sound plays, TUI greets you
5. Hub shows onboarding Interview overlay → name, language, TTS (30s)
6. Drop some files into content/notes/, content/projects/
7. /compile → wiki materializes
```

### 15.3 Not in v1
- GUI. Everything is terminal (TUI is terminal-native, not a desktop app).
- Sync between multiple drives. One drive = one brain.
- Multi-user. Single human, single SSD.

---

## 16. Roadmap

### Phase 0 — Skeleton
- Public GitHub repo `koljaschoepe/myhub` ✓ (DONE)
- LICENSE, README, SPEC v1 → SPEC v2 ✓ (DONE)
- `.gitignore` skeleton ✓ (DONE)
- Reformat T7 from ExFAT → APFS, name volume `myhub`
- Directory scaffold under SSD root (all the empty dirs + template files)
- `manifest.json` generator script (Go or shell)

### Phase 1 — MVP that boots to a hub
- `myhub-tui` Go project skeleton: Bubble Tea + Lipgloss, static arm64 build via `make build`.
- TUI minimal: header with time-aware greeting + project list from filesystem scan + numbered keymap.
- `internal/launch/` using `tea.ExecProcess` to run `claude` in selected project dir.
- `install.command` + launchd plist + `on-mount.sh` (with sound + notification).
- `launcher.sh` setting `CLAUDE_CONFIG_DIR` and exec'ing `myhub-tui`.
- Bundled Claude Code binary (arm64).
- Root `content/CLAUDE.md` template (llms.txt-style map).
- Per-directory `CLAUDE.md` stubs.
- `terse` output style.
- **Ship-ready for author's own daily use. OAuth-on-SSD works across Macs. Hub + Claude launch round-trip works.**

### Phase 2 — Interview + Setup + Voice
- `internal/interview/` primitive (§12) — Bubble Tea overlay component.
- `/setup` slash command + matching first-run TUI wizard (via Interview primitive).
- TTS integration: `say -v Daniel` on brief.
- `briefer` agent v1: headless `claude -p --agent briefer` called by TUI on mount.
- `memory/MEMORY.md` + typed memory files scaffold.
- `/reflect` slash command: distills session into memory.
- `session-end.sh` hook: auto-reflect on non-trivial sessions.
- Project registry (`memory/projects.yaml`) with atomic writes + corrupt-self-heal.
- Project detail screen (`ScreenProject`) + new/rename/delete wizards.

### Phase 3 — Wiki Compiler (Karpathy pattern)
- `compiler` agent full implementation.
- `content/wiki/` structure with people/projects/concepts/timeline subdirs.
- `/compile` and `/compile --since=` slash commands.
- `fswatch` watcher (background, during session): debounced auto-compile triggers.
- Wiki linking conventions: source backlinks, cross-article `[[wikilinks]]`.
- `myhub compile --full` CLI for cold rebuild.
- Hub shows wiki freshness indicator ("wiki 2h stale").

### Phase 4 — Public Release
- Polish README (GIF of plug-in → TUI → voice greeting → Claude session).
- `uninstall.command` (removes launchd plist cleanly).
- `manifest.json` + SHA-256 verification in installer.
- GitHub Actions release pipeline (build arm64 binary, package, publish tarball).
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
- tmux-pane mode for parallel Claude sessions.

---

## 17. Decisions Resolved (v2 of spec)

| # | Decision | Resolution |
|---|---|---|
| A | Project name | **`myhub`** ✓ |
| B | SSD volume label | **`myhub`** (after reformatting T7 from ExFAT → APFS) ✓ |
| C | Sound on mount | Starter sound TBD; `say -v Daniel` voice greeting is the real centerpiece ✓ |
| D | Terminal app | **`Terminal.app`** (universal) ✓ |
| E | Encryption scope | **Unencrypted SSD** for MVP (user choice) ✓ |
| F | Architecture | **arm64-only** for MVP ✓ |
| G | Knowledge architecture | **Karpathy LLM Wiki pattern** (no Ollama, no vector DB in MVP) ✓ |
| H | GitHub repo | **Public from day one — created** github.com/koljaschoepe/myhub ✓ |
| I | Auth | **OAuth token on SSD** via `CLAUDE_CONFIG_DIR` ✓ |
| **J** | **Mount-flow entrypoint** | **TUI hub, not Claude directly** (v2 pivot) ✓ |
| **K** | **Scope of managed projects** | **SSD-resident only** (`content/projects/*/`) ✓ |
| **L** | **TUI stack** | **Bubble Tea v2 (Go) + Lipgloss v2 + Bubbles** ✓ |
| **M** | **Claude launch model** | **`tea.ExecProcess` with return-to-hub** ✓ |
| **N** | **Briefer UX** | **Hybrid: immediate simple greeting + async briefer panel + TTS on ready** ✓ |
| **O** | **Interview primitive** | **First-class, shared TUI/agent/CLI contract (§12)** ✓ |
| **P** | **Visual identity** | **Inherit OpenAra palette + glyphs** ✓ |

### Remaining micro-decisions before Phase 0 continues
| # | Question | Recommended default |
|---|---|---|
| 1 | Reformat T7 (ExFAT → APFS) now? | **Yes.** ExFAT breaks symlinks, unix perms, git. |
| 2 | Boot sound file | Ship Apple's `Glass.aiff` as placeholder; pick real one in Phase 2. |
| 3 | TTS voice for MVP | **`Daniel`** with upgrade docs pointing to Piper/ElevenLabs. |
| 4 | `myhub-tui` Go module path | `github.com/koljaschoepe/myhub/myhub-tui`. |

---

## 18. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| macOS Gatekeeper blocks unsigned binaries (claude + myhub-tui) on new Macs | High | Medium | README instructs `xattr -dr /Volumes/myhub`; Phase 4 notarize |
| Mount path collision (`/Volumes/myhub 1`) | Medium | Low | UUID-based path discovery in launcher |
| Wiki corruption / stale | Low | Low | Raw `content/` is ground truth; `/compile --full` always restores |
| TTS voice not installed on a new Mac | Medium | Low | Fallback to default system voice; voice download suggestion |
| User plugs into corp Mac by mistake | Low | High | Phase 4 safe-mode + host UUID allowlist |
| API costs from OAuth subscription limits | Medium | Low | User on Pro/Max; rate limits are Anthropic's, not ours |
| Lost SSD → OAuth token leak | Low-Medium | Medium | Subscription-scoped; immediate revoke via claude.ai; opt-in encryption in v1.1 |
| Spec drift between personal use and public repo | Medium | Medium | Single codebase; `content/` + `memory/` + `.credentials.json` in `.gitignore` |
| Compiler agent rewrites wiki poorly | Medium | Medium | All diffs reviewable in git; `/compile --dry-run`; raw files untouched |
| `tea.ExecProcess` TTY conflict with Claude's own alt-screen | Low | Medium | Bubble Tea exits alt-screen before handoff; tested on Claude Code 2.1.117 |
| Briefer subprocess hangs / slow | Medium | Low | 10s hard timeout in Go; static fallback panel |
| Project registry YAML corrupts | Low | Low | Atomic write + backup-on-parse-error + filesystem rescan |

---

## 19. Non-goals (explicit)

- Not a replacement for Obsidian / Notion / Apple Notes. Sits underneath.
- Not cloud-synced across machines. One drive is the canonical instance.
- Not a UI product (in the desktop-app sense). Terminal-native.
- Not a multi-tenant SaaS. Personal and portable.
- Not an LLM router. Uses Claude only (could become pluggable later, not now).
- **Not a shell.** The TUI is a project hub, not a replacement for zsh. It dispatches to Claude / lazygit / editors; it doesn't try to be everything.
- **Not OpenAra.** Shares DNA (exec-launch, numbered projects, YAML registry, palette) but OpenAra provisions a Linux server; myhub runs from an SSD on a Mac. Different problem, similar ergonomics.

---

*End of spec v2. Next step: Phase 0 — format T7 to APFS, scaffold SSD directory structure, scaffold `myhub-tui` Go project.*
