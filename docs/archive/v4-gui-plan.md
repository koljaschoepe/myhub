# myhub v4 — GUI Product Plan  (ARCHIVED 2026-04-24)

> ⚠️ **Archived 2026-04-24 — superseded by [`arasul-plan.md`](arasul-plan.md).**
> v4 was written under assumptions that changed within 24 hours: macOS-only v1
> (now: all three OSes day-one), APFS filesystem (now: exFAT), product
> name `myhub` (now: Arasul). The three-pane Tauri GUI vision, the hybrid
> SKU model, and the v3-engine reuse strategy all carried over. Keep v4 for
> historical context; planning decisions now live in `arasul-plan.md`.
>
> **Status:** vision + phased plan, not yet implemented
> **Supersedes for Layer 5 only:** [SPEC.md §3 Layer 5 Interaction](../SPEC.md). Layers 0-4 (runtime, content, intelligence, persona) are unchanged.
> **Date:** 2026-04-23
> **Decisions locked:** macOS-only v1 · Hybrid SKU (preloaded SSD + software-only) · Tauri 2.x · Auto-launch on mount with Finder double-click fallback
> **Authoring style:** this document is intentionally opinionated. Every challenge section names the failure mode first and the mitigation second.

---

## 0. TL;DR

Replace the terminal TUI (`myhub-tui/`, Python, prompt_toolkit+rich) with a native-feeling three-pane desktop application built in **Tauri 2.x** that lives as a `.app` bundle on the SSD. Keep everything below Layer 5 intact: launchd trigger, portable Python runtime, Go maintenance CLI (`bin/myhub`), `.claude/` config, `content/` layout, `memory/`, auth-on-SSD, manifest verification.

The GUI is the new face. The engine is the v3 engine, unchanged.

```
┌──────────────────────────────────────────────────────────────┐
│ myhub.app — Tauri 2.x + WKWebView                            │
│                                                              │
│ ┌──────────┬──────────────────────┬───────────────────────┐ │
│ │          │                      │  Chat (briefer)        │ │
│ │  Tree    │   Markdown Editor    │  ┌──────────────────┐  │ │
│ │ content/ │   (CodeMirror 6)     │  │                  │  │ │
│ │          │                      │  │                  │  │ │
│ │ filtered │   live preview       │  └──────────────────┘  │ │
│ │          │                      │  Terminal (xterm.js +  │ │
│ │          │                      │  portable-pty)         │ │
│ │          │                      │  ┌──────────────────┐  │ │
│ │          │                      │  │ $ claude         │  │ │
│ │          │                      │  │ …                │  │ │
│ │          │                      │  └──────────────────┘  │ │
│ └──────────┴──────────────────────┴───────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

---

## 1. Challenging the Vision

Before the plan, an honest audit of the product idea. These are the things that will bite if ignored.

### 1.1 What the vision gets right

- **Layered swap, not rewrite.** The v3 engine is already SSD-portable, already launches Claude via `os.execvp`, already has a project registry, a briefer, a wizard primitive, and auth-on-SSD. Replacing the TUI layer with a GUI layer is a bounded problem, not a greenfield.
- **Three-pane Cursor layout is a solved UX pattern.** Cursor, VS Code, Zed, Obsidian all converged on (tree ‖ editor ‖ side-panel). Users recognize it without training. That's a product moat: zero learning curve for anyone who has ever seen VS Code.
- **Embedded Claude Code is a genuinely new mechanic.** Wrapping the CLI inside a real PTY inside a product-UI means non-technical users never see a terminal in the "oh god, what is this" sense — they see a chat with a blinking cursor that happens to be a real shell.
- **"Brain on a drive" narrative sells itself.** You can demo the product in ten seconds: plug USB-C into a Mac, dashboard appears, type a question, get answered by a Claude that already knows the user. That's the viral clip.
- **Tauri + filtered file tree is the right technical bet.** Both research agents independently converged on the same stack. Sub-200 MB cross-platform bundle, production-grade embedded PTY, Monaco/CodeMirror in the webview with no special-casing.

### 1.2 What the vision gets wrong (or underweights)

- **"Plug in a strange SSD and the app just opens, no clicks, no dialogs."** Impossible in 2026 on macOS without MDM enrollment. On *every* new Mac the user plugs into, you get one Gatekeeper dialog (even for notarized apps, if the xattr gets set). Auto-launch on mount requires a launchd LaunchAgent installed into `~/Library/LaunchAgents/` — that's a *per-Mac* install step, not something you can preload onto the SSD. The v3 `install.command` pattern is actually correct; there is no more magical alternative. Accept this: first mount on a new Mac = 1-2 clicks, every mount after = silent. The onboarding has to sell this honestly, not hide it.
- **"One file the user clicks to launch the dashboard."** A `.app` on macOS *looks* like a single file in Finder (it's secretly a directory). So the experience you want is achievable. But the moment someone inspects the SSD from a Windows machine or from the Terminal, they see a `Contents/MacOS/myhub` binary inside. Fine for v1, relevant when Windows ships.
- **Target = "students", but macOS-only v1.** Accurate estimate: 25-30% of undergrad/grad CS students run macOS primary; ~60% run Windows; the remainder Linux. v1 addresses roughly one-quarter of your stated market. This is an acceptable tradeoff *if* you treat v1 as "design-partner phase" (100-500 users) and plan Windows for v2 at 6-9 months in. Do not market to "students" broadly on day 1 — market to "students on Mac" explicitly.
- **External-drive eject during sleep is a real operational issue.** macOS routinely unmounts external drives during system sleep. When the SSD vanishes mid-session, open file handles return EIO and the app can crash or lose unsaved work. Every pro-tier app that runs from external storage (Logic, Lightroom, Final Cut, DaVinci) deals with this; consumer apps typically don't. This has to be architected in from day one — **autosave every few seconds, detect disk-disappeared callbacks, show a "reconnect your drive" modal on remount** — not bolted on in v1.1 after a student loses their thesis notes.
- **The Anthropic API cost model is unresolved.** Every Claude interaction on this product costs Anthropic API money. Who pays? Three options, each with a sharp edge:
  1. User brings their own Anthropic account → cheapest for you, highest friction for the non-technical audience (they need to create an account, add a payment method, set up billing).
  2. You pre-pay via your own API key shipped on the SSD → user has magical experience but your costs scale linearly with use; abuse vector if the key gets extracted.
  3. Subscription tier managed by a small backend (you host a proxy, users authenticate, quota-enforced) → "real" product, but kills the "zero cloud, everything local" narrative and adds a server you have to operate.
  This is the single biggest strategic unknown. **I recommend (1) with a guided onboarding wizard for v1** so you don't burn cash or build a backend prematurely. Option (3) becomes interesting at scale. See §7.1.
- **"Creative, cool aesthetic"** is the least specific requirement in your brief and therefore the easiest to get wrong. Cursor's aesthetic is *functional-minimal* (muted greys, subtle monochrome accents, generous whitespace). Replit, Linear, and Raycast are louder. Arc-browser-era is the closest "cool" reference for consumer-targeted dev-adjacent tools. You need to pick a **visual anchor** (§7.3) before design starts, otherwise you'll ship something that looks like a student project.
- **Hybrid SKU = two supply chains.** Preloaded-SSD and software-download are not 50/50 additive effort; they're more like 70/50. Preloaded SSDs need a procurement-branding-imaging-QA-fulfillment-returns pipeline. Software-download needs a codesigned DMG, a landing page, a download CDN, a Sparkle-style auto-updater, and a "prepare my own SSD" wizard. **Start software-only; add preloaded SKU only after v1 has real users giving feedback.** (See §6.7.)
- **Updates for SSDs already in the wild.** When you ship v1.1, how does a user's SSD get it? Download the new `.app` on the host Mac, drag it to the SSD? That's one manual step. Auto-update on mount? Needs network access on the host, which isn't guaranteed, and a verifier so you don't brick the drive. Most common answer (used by portable Steam setups, Portable Apps, Ventoy): a built-in "check for updates" button that fetches a signed delta, verifies against manifest, writes atomically. Design this as a first-class feature in Phase 5, not a Phase 7 afterthought.

### 1.3 Things to stop worrying about

- **Size of the app.** Tauri bundles at ~15 MB on mac. Nothing to optimize.
- **Monaco vs CodeMirror.** Both work. Decide by team comfort, not by technical merit.
- **Performance of the webview.** WKWebView on Apple Silicon is indistinguishable from native for this use case. Non-issue.
- **OAuth/auth flow.** Claude Code already stores the OAuth token in `.claude/.claude.json`, and v3 already points it at the SSD via `CLAUDE_CONFIG_DIR`. The GUI just wires the env var. Solved.

---

## 2. Product Definition

### 2.1 One-sentence pitch

> A portable AI workspace on a USB-C SSD — plug it into any Mac, a three-pane dashboard opens, and Claude is already in your project with your memory loaded.

### 2.2 Target user, sharpened

- **Primary (v1, 2026-06 to 2026-09 pilot):** Mac-using graduate or upper-undergrad students in humanities, design, or research disciplines (not CS). They want an AI that remembers their work, they already know how to use their Mac, they will *not* use the CLI, they *will* double-click an icon. 100-500 design-partner users.
- **Secondary (v1.1, 2026-09 onward):** Knowledge workers (PhDs, indie consultants, writers, lawyers) who want a portable second brain. Same Mac-only assumption.
- **Future (v2+, Windows):** the CS-student-on-Windows segment.
- **Not the target:** engineers who already live in Claude Code CLI. They'll use the TUI or the raw CLI; myhub is overhead for them.

### 2.3 Product SKUs

| SKU | Who buys | What ships | Price anchor |
|---|---|---|---|
| **A — Preloaded** | Beta waitlist, gift buyers, non-technical | 512 GB or 1 TB USB-C SSD, factory-flashed with myhub, drive engraving, sleeve | €149 / €199 |
| **B — Software-only** | Users with their own SSD | Signed DMG download; drag-to-install onto any APFS volume; wizard formats/labels the drive | €29 one-time, or free with own Anthropic sub |

SKU B ships first. SKU A ships once SKU B has 100 happy users.

### 2.4 Non-goals

- A cloud service. Everything lives on the SSD.
- A PKM replacement for Obsidian/Notion. Sits underneath.
- A terminal emulator for power users. The embedded PTY is a means to launch Claude Code, not a feature users should extend.
- A code editor competing with Cursor/VS Code. The markdown editor is for notes and project files, not for building apps.
- A multi-user / team product in v1. Single-user, single-SSD.

---

## 3. UX North Star

### 3.1 First-time experience on a new Mac

```
User plugs in SSD
    ↓
Finder window auto-opens the drive (standard macOS behavior)
    ↓
User sees exactly three items: [myhub.app] [Install on this Mac.command] [README.txt]
    ↓
User double-clicks myhub.app
    ↓
macOS: one Gatekeeper dialog ("myhub.app from Kolja Schoepe GmbH") — click Open
    ↓
App launches; first-run wizard:
  · Welcome screen (10s video)
  · "Give myhub access to the drive" (macOS Sequoia removable-volume prompt)
  · Choose name
  · Claude login (OAuth flow opens browser, token lands on SSD)
  · Offer: "Want the app to open automatically next time? [Install] [Skip]"
    ↓
Dashboard renders.
```

On subsequent mounts on the same Mac: launchd triggers → app opens silently, no prompts.
On mounts to *new* Macs: same 4-step first-run wizard, all state re-used from the SSD.

### 3.2 Dashboard at rest (FULL layout, ≥1280×800)

```
┌─ myhub ─────────────────────────────────────────────────────────────────┐
│ ★ Brief Kolja — Tue Apr 23. Two projects touched this week: thesis,     │
│   client-x. Compile drifted (last: 3d ago). No outstanding commits.    │
├───────────────┬─────────────────────────────────────┬───────────────────┤
│ CONTENT       │ thesis/notes/chapter-3.md           │ CHAT              │
│ ─────────     │ ─────────────────────────────────── │ ─────────────     │
│ ▶ notes       │ # Chapter 3                         │ You:              │
│ ▼ projects    │                                     │ > summarize the   │
│   ▶ client-x  │ ## 3.1 Methodology                  │   last edit       │
│   ▼ thesis    │                                     │                   │
│     ▶ notes   │ The core argument hinges on …       │ briefer:          │
│     ▶ drafts  │                                     │ Added two para-   │
│     chapter   │                                     │ graphs to 3.1 on  │
│ ▶ communic.   │                                     │ methodology…      │
│               │                                     │                   │
│               │                                     │ ─────────────     │
│               │                                     │ TERMINAL          │
│               │                                     │ kolja@thesis $ _  │
├───────────────┴─────────────────────────────────────┴───────────────────┤
│ ⌘P open · ⌘N new project · ⌘K command · ⌘⇧C claude · ⌘, settings        │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Pane-by-pane breakdown

**Left — Content tree (filtered).**
Shows only `content/notes/`, `content/projects/`, `content/communication/` by default. Hides `.boot/`, `bin/`, `runtime/`, `.claude/`, `memory/`, `tooling/`, `myhub-tui/`, `myhub-cli/`, `.git/`. Hidden set comes from `.boot/tree-filter.json` (editable). User can toggle "show all" via ⌥-click on a parent, for rare plumbing forays. Click on a folder = expand. Click on a `.md` = open in middle pane. Right-click = contextual actions (new file, rename, delete, reveal in Finder, launch Claude here).

**Middle — Markdown editor (CodeMirror 6).**
Soft-wrap, live preview toggle (⌘⇧P), Cursor-style gentle syntax highlight, autosave every 1s to SSD. Frontmatter support. `CLAUDE.md` files get a small badge in the tab title ("persona"). Read-only mode when drive is offline.

**Right — Dual stack.**
*Top half: chat.* Native chat UI (not terminal rendering). Messages stream. Briefer agent is the default persona, routed via `claude -p --agent briefer`. User can @-mention a project to ground the conversation in that project's context.
*Bottom half: terminal.* Real PTY (xterm.js + `portable-pty`). Default command: `claude code` logged in via SSD token, cwd = currently-selected project. Resize, ANSI colors, Ctrl-C all work. This is the "power user" escape hatch — students don't need it, but seeing it builds trust.

**Top — Brief bar.**
One-line briefer output, refreshes on mount and via ⌘R. Collapsible.

**Bottom — Command bar.**
Contextual footer à la k9s. Keybindings change per pane.

### 3.4 Entry-points

- **Auto-launch on mount** (primary): launchd LaunchAgent installed per-Mac on first run.
- **Double-click `myhub.app`** (fallback): works without any per-Mac install. Good for new-Mac-first-mount.
- **Double-click `Open myhub.command`** (sanity-escape): if .app won't launch, plain shell script that opens the app.
- **`myhub-cli` from Terminal** (power users): unchanged from v3.

### 3.5 Visual anchor

Decision deferred to Phase 0 design spike, but the working reference is: **Linear's clarity × Obsidian's density × Arc's confident use of colour.** *Not* Cursor (too tool-like, too grey). *Not* Raycast (too consumer-SaaS-y). Think: instrument, not widget.

---

## 4. Technical Architecture

### 4.1 Component diagram

```
LAYER 5 · INTERACTION (replaced)
┌──────────────────────────────────────────────────────────────┐
│  myhub-app/  (Tauri 2.x, ~15 MB bundle)                       │
│  ├─ src-tauri/            Rust backend                        │
│  │   ├─ main.rs           app entry, tray, lifecycle          │
│  │   ├─ pty.rs            portable-pty bridge (xterm.js bytes)│
│  │   ├─ fs.rs             filtered fs reads/writes            │
│  │   ├─ claude.rs         spawn `bin/claude`, env-inject      │
│  │   ├─ registry.rs       project CRUD (writes projects.yaml) │
│  │   ├─ launchd.rs        install/uninstall per-Mac hook      │
│  │   └─ ipc/              Tauri commands (§4.5)               │
│  └─ src/                  TypeScript + React + Tailwind       │
│      ├─ App.tsx           three-pane shell                    │
│      ├─ panes/Tree.tsx    filtered tree                       │
│      ├─ panes/Editor.tsx  CodeMirror 6 host                   │
│      ├─ panes/Chat.tsx    streaming chat                      │
│      ├─ panes/Terminal.tsx xterm.js + PTY IPC                 │
│      └─ onboarding/       first-run wizard                    │
└──────────────────────────────────────────────────────────────┘

LAYER 4-0 (unchanged from v3)
  .claude/  content/  memory/  bin/  runtime/  tooling/  .boot/
```

### 4.2 Stack

- **Tauri 2.x** as the shell. Confirmed via research: ~15 MB macOS bundle, production PTY crate, shipping precedent for Claude-Code-inside-Tauri.
- **Rust** in `src-tauri/`. Only place Rust is introduced to the project.
- **TypeScript + React** in `src/`. React chosen for depth of ecosystem (xterm.js wrapper, CodeMirror 6 bindings). Svelte/Solid acceptable alternates if team prefers.
- **Tailwind + shadcn/ui** for styling. Lets us iterate on visual anchor fast without a designer.
- **CodeMirror 6** for editor. Smaller and more composable than Monaco, better markdown support out of the box.
- **xterm.js** for terminal rendering, bridged to Rust `portable-pty`.
- **No new state backend.** Everything reads/writes the SSD directly via Rust FS APIs. Existing `memory/projects.yaml` remains source of truth.

### 4.3 Reuse from v3

| v3 component | Reused as-is? | Notes |
|---|---|---|
| `.boot/on-mount.sh` | Yes | Replace `exec launcher.sh` with `exec /Volumes/myhub/myhub.app/Contents/MacOS/myhub` |
| `.boot/install.command` | Yes, refactored | Still installs launchd plist, but registers the .app, not the bash launcher |
| `.boot/manifest.json` | Yes | Extended to cover .app bundle |
| `.boot/trusted-hosts.json` | Yes | Unchanged |
| `bin/claude` | Yes | Spawned from Rust backend with `CLAUDE_CONFIG_DIR` env |
| `bin/myhub` (Go CLI) | Yes | GUI shells out for `compile`, `verify`, `stats`, `trust` |
| `runtime/python/` | Yes | Only needed for briefer subagent (claude -p --agent briefer) |
| `.claude/` | Yes | Claude config layer, untouched |
| `content/` | Yes | Source of truth for the tree pane |
| `memory/` | Yes | Memory layer, untouched |
| `myhub-tui/` | Kept, archived | Still launchable via `bin/myhub-tui`. Expert mode / fallback / debug. |
| `memory/projects.yaml` | Yes | GUI reads + writes, same schema |
| Briefer agent | Yes | Invoked via `claude -p --agent briefer` same as v3 |

The v3 Python TUI stays shippable — it's a 2100 LOC investment that works today. Keep it under `bin/myhub-tui` as a minority entrypoint.

### 4.4 Launch flow (v4, mount → dashboard)

```
launchd (per-Mac LaunchAgent)
    ↓ on StartOnMount of /Volumes/myhub
.boot/on-mount.sh
    ↓ (1) verify manifest
    ↓ (2) play connect.aiff + notify
    ↓ (3) exec myhub.app
myhub.app (Tauri)
    ├─ Rust backend starts
    │   ├─ loads projects.yaml
    │   ├─ sets CLAUDE_CONFIG_DIR, MYHUB_ROOT, PATH
    │   └─ spawns briefer subagent (headless, 12s budget)
    └─ WebView loads UI
        ├─ renders three-pane shell immediately (<200ms)
        ├─ fills tree from content/
        └─ briefer result streams in on top bar
```

When the user launches Claude on a project, Rust spawns `bin/claude` inside the bottom-right PTY with `cwd = content/projects/<slug>`. No `os.execvp` needed — the PTY owns the process.

### 4.5 IPC surface (Tauri commands, stable)

```
// fs
list_tree(path)             → FilteredNode[]
read_file(path)             → string
write_file(path, content)
rename(src, dst)
delete(path)
reveal_in_finder(path)

// projects
list_projects()             → Project[]
create_project(args)        → Project       // wizard
delete_project(slug)
resolve_project(query)      → Project       // fuzzy

// claude
launch_claude(project_slug, pane_id)        // spawn in PTY
ask_briefer(prompt)         → stream<string>

// pty
pty_open(cmd, cwd, env)     → pty_id
pty_write(pty_id, bytes)
pty_resize(pty_id, cols, rows)
pty_kill(pty_id)
// events: pty://{id}/data → xterm.js

// git
git_status(project)         → GitStatus
git_pull(project)           → stream<line>
git_push(project)           → stream<line>

// system
compile(args)               → stream<line>
verify()                    → VerifyReport
stats()                     → Stats
install_launchd()           → bool
uninstall_launchd()         → bool
is_trusted_mac()            → bool
trust_this_mac()

// settings
get_config()                → Config
set_config(patch)
```

This is the *entire* backend API. About 30 calls. Stable enough to freeze at the end of Phase 2.

### 4.6 File-tree filter

`.boot/tree-filter.json`:
```json
{
  "version": 1,
  "include": ["content/"],
  "hide_names": [".DS_Store", ".git", "__pycache__", "node_modules"],
  "hide_at_root": [".boot", "bin", "runtime", "tooling", ".claude",
                   "myhub-tui", "myhub-cli", "memory", ".github"],
  "show_hidden_with_alt_click": true
}
```

Filter is applied in Rust before sending tree to frontend — never send the whole FS to JS.

### 4.7 Offline/eject handling

1. Rust subscribes to DiskArbitration's `DAUnregisterDiskDisappearedCallback`.
2. On disappearance: pause all PTYs (SIGSTOP), freeze editor (read-only badge), show modal "Reconnect your drive".
3. Autosave runs every 1s via a debounced write + fsync. No in-memory-only unsaved state beyond 1s.
4. On remount: re-resolve absolute paths, resume PTYs, dismiss modal, refresh tree.

### 4.8 Update pipeline

- `.boot/manifest.json` carries a `version` field and a `release_feed` URL.
- On every mount, Rust does a HEAD request (best-effort, 2s timeout) against the feed.
- If a newer signed+notarized bundle is available: show a subtle "Update available" pill in the top bar. Click → download to `/Volumes/myhub/.boot/updates/pending.app`, verify signature, atomic swap on next quit, manifest update.
- If the host is offline: silent skip. Mount always succeeds even without network.
- Updates never modify `content/`, `memory/`, or `.claude/`. Only the `.app` bundle and `bin/*` binaries.

### 4.9 Auth model

Unchanged from v3. Claude Code's OAuth token lives at `/Volumes/myhub/.claude/.claude.json` (mode 0600). `CLAUDE_CONFIG_DIR` env var tells the CLI to look there. Token is subscription-scoped, not device-bound — works across Macs automatically. First-run wizard triggers `claude login` in the embedded PTY if no token is present.

---

## 5. Hard Problems and Mitigations

| Problem | Mitigation | Phase |
|---|---|---|
| Gatekeeper first-launch dialog on every new Mac | Notarize with Apple Developer ID ($99/yr). Ship SSDs flashed via direct write, not download, so no quarantine xattr. Onboarding honestly explains the one-time prompt. | Phase 5 |
| AppTranslocation | Never ship `.app` inside a compressed archive that triggers quarantine. Factory-flash the SSD; user-side installer uses `ditto` (preserves xattrs → preserves absence of quarantine). | Phase 5 |
| External drive eject on sleep | Autosave every 1s; DiskArbitration subscription; "reconnect" modal; suggest "prevent drive sleep" in onboarding. | Phase 1 |
| Launchd per-Mac install | Accepted reality. First-run wizard offers one-click install. Fallback: double-click .app works without launchd. | Phase 4 |
| Updates to SSDs in the wild | In-app update checker, signed delta, atomic swap. Opt-out per user. | Phase 5 |
| Anthropic cost model | v1: user brings own Anthropic account. Onboarding wizard walks them through signup. Revisit backend-proxy model at 500+ users. | Phase 4 + product review |
| Non-technical user confused by terminal pane | Default the right-pane bottom to collapsed. Reveals on ⌘J. Chat pane is primary. | Phase 3 |
| SSD swap between Macs loses launchd hook | Intended behavior — launchd is per-Mac. Onboarding wizard detects new Mac and offers to install. | Phase 4 |
| Performance on old Intel Macs | Not supported in v1. macOS 14+ Apple Silicon only. `.boot/preflight.sh` blocks launch with a clear error. | Phase 0 |
| User extracts API key from SSD | Not a real threat for v1 (user's own key). Becomes threat if you move to backend-proxy — that's when you add short-lived tokens. | Phase 6+ |

---

## 6. Phased Roadmap

Time estimates are calendar-weeks assuming one full-time Claude-plus-Kolja pair. Double for part-time.

### Phase 0 — Foundation (2 weeks)

**Goal:** unambiguous spec for what Phase 1 will build.

- Lock visual anchor via a 3-option moodboard (Linear-like / Obsidian-like / Arc-like). Ship a click-through Figma.
- Bootstrap empty Tauri 2 project at `myhub-app/` on the SSD. Verify it builds, runs, bundles.
- Confirm `portable-pty` + xterm.js hello-world (echo commands, resize, colors).
- Write `docs/v4-design-spec.md` with wireframes + component inventory.
- Write `docs/v4-api-spec.md` with the frozen IPC surface from §4.5.

**Exit criteria:** click-through prototype + two spec docs + a "hello world" Tauri binary on the SSD.

### Phase 1 — Skeleton + PTY + Claude (3-4 weeks)

**Goal:** a minimum working three-pane app that can open a project and talk to Claude.

- Three-pane layout renders with hardcoded mock data.
- Left tree: real filtered reads from `content/`.
- Middle editor: CodeMirror 6 reading a selected file, no save yet.
- Right terminal: xterm.js + `portable-pty` bridge, running a default shell.
- Launch Claude Code inside terminal when user clicks a project: `bin/claude` with `CLAUDE_CONFIG_DIR` and cwd set.
- Manifest + preflight check on app start.
- Basic autosave + reconnect-on-eject handling (minimal).

**Exit criteria:** you can plug in the SSD, run the app from Terminal, pick a project, and Claude Code opens inside the right pane with the right project loaded. No auto-launch yet, no onboarding.

### Phase 2 — Editor, Tree, Registry (3 weeks)

**Goal:** the workspace feels like a real tool.

- Editor: live-preview toggle, autosave, read-only when offline, tab bar for multiple open files.
- Tree: expand/collapse state persisted, right-click menu (new/rename/delete/reveal), drag-to-reorder disabled for v1.
- Project registry: reads/writes `memory/projects.yaml`, listed in a command palette (⌘P).
- Command palette (⌘K): all IPC commands from §4.5 exposed.
- Briefer: top bar streams the briefer output on mount.

**Exit criteria:** a user can do real work inside the app — edit notes, create a project, invoke Claude, see a briefing — without touching the CLI.

### Phase 3 — Chat Pane (2 weeks)

**Goal:** the non-technical-friendly face.

- Chat pane UI (streaming, markdown-rendered messages).
- Default backend: `claude -p --agent briefer` for chat; slash-commands surface other agents.
- @-mention a project / file → grounds conversation.
- Collapse terminal pane by default; ⌘J toggles.

**Exit criteria:** a student can plug in the drive, type "summarize what I worked on this week" in the chat, and get a grounded answer without ever seeing a terminal.

### Phase 4 — Onboarding, Settings, Wizards (2-3 weeks)

**Goal:** first-run UX is smooth enough for a non-technical user.

- First-run wizard (§3.1): welcome → drive access → name → Claude login → install-launchd?
- Settings panel (⌘,): paths, drive label, auto-launch toggle, filter overrides, memory browser (readable), Claude login/logout, update checker.
- Wizard primitive ported from v3 (pending-handler pattern): used for `/new project`, `/delete project`, confirms.
- Safe-mode flag honoured in GUI (no memory writes, banner visible).
- launchd install/uninstall flow in Rust (replaces `install.command` / `uninstall.command` for GUI users, but CLI shell versions stay for power).

**Exit criteria:** plug-in-to-working-chat on a fresh Mac takes under 3 minutes with zero CLI.

### Phase 5 — Packaging, Signing, SSD Imaging (2-3 weeks)

**Goal:** shippable binary, shippable SSD image.

- Apple Developer ID cert + notarization pipeline (xcrun notarytool + stapler). GitHub Actions job.
- Signed DMG for SKU B download.
- `tooling/image-ssd.sh`: takes a fresh APFS volume and flashes it to factory-myhub state (manifest, boot scripts, bin/, runtime/, empty content/ with examples, .app bundle). This becomes the preload pipeline for SKU A.
- In-app updater (§4.8) functional against a GitHub release feed.
- Full end-to-end: download DMG on one Mac → run installer → it prepares an empty SSD → unplug → replug → dashboard opens.

**Exit criteria:** the product can reach a user's hands through both SKU B and a manual SKU A (factory-flash by hand).

### Phase 6 — Beta (4 weeks)

**Goal:** 25 design partners, daily-driven for 2+ weeks each.

- Private beta: 25 handpicked users on Discord / direct.
- Weekly release cadence. Telemetry opt-in (usage counts only, never content).
- Support channel: shared Notion + scheduled office hours.
- Bug triage: GitHub issues, labels, SLA 48h for blockers.

**Exit criteria:** measurable retention (>60% daily-active after 1 week), NPS >30 from beta, three written testimonials.

### Phase 7 — Public launch (SKU B) + SKU A preparation (ongoing)

- Landing page (name, story, video, preorder for SKU A, free download for SKU B with Anthropic sub).
- First 100 SKU A units factory-flashed: procure SSDs (Samsung T7 shield / SanDisk Extreme as candidates), brand sleeve, flash via `tooling/image-ssd.sh`, QA, ship.
- Publicize: HN, Twitter/X, PKM communities, one or two tech newsletters (Stratechery-adjacent reaches the grad-student demo).

### Phase 8 — Windows port (9 months post v1, stretch)

- Port Tauri app to Windows (x64 + arm64) — mostly config + path-handling.
- Replace launchd with Windows Scheduled Task triggered by disk-insert (TaskScheduler DeviceArrival).
- Replace DiskArbitration with WM_DEVICECHANGE.
- EV code-signing cert for SmartScreen reputation.
- Ship SKU A Windows variant + combined Windows+Mac variant.

---

## 7. Open Questions for You

I can proceed immediately on Phases 0-1 under reasonable defaults. Four questions will shape later phases and should get answered before Phase 3:

### 7.1 Anthropic cost model
Default recommendation: user brings own Anthropic subscription, onboarded via wizard. Are you OK with that for v1?

### 7.2 Pricing
SKU A at €149/€199 is a guess based on USB-C-SSD-at-BOM + branded-packaging + margin. SKU B at €29 one-time is a guess based on "cheap enough to impulse-buy after hearing the story." Do these pass your gut check, or are you aiming higher-luxury (€299/€79) or lower-mass (€89/free)?

### 7.3 Visual anchor
Phase 0 includes a moodboard with three concrete directions. Any strong prior — love/hate — for Linear, Obsidian, Arc, Raycast, Notion, Cursor as references?

### 7.4 Distribution channel for SKU A
Direct Shopify + DHL yourself, or partner (e.g. Etsy-of-tech, dedicated retailer)? Affects Phase 7 by 2-3 weeks of plumbing.

### 7.5 Name
"myhub" is a working codename. For a consumer product targeting students, it's both too generic (SEO) and too developer-y. Do you want me to put a naming exploration into Phase 0, or is the product name something you've already decided externally?

---

## 8. Success Metrics

| Horizon | Metric | Target |
|---|---|---|
| Phase 1 exit | Time from SSD insert → Claude-in-project | < 15s on M1 / macOS 14 |
| Phase 4 exit | Time from fresh Mac to working chat | < 3 min, 0 CLI commands |
| Phase 6 exit | D7 retention of beta users | > 60% |
| Phase 6 exit | Unsolicited share rate | at least 5 / 25 users tell a friend |
| Phase 7 launch | SKU B downloads in first 30 days | > 500 |
| Phase 7 +90 days | SKU A units sold | > 100 |
| Phase 7 +90 days | Bug: lost user data | 0 |

---

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Tauri PTY plugin regresses in a minor release | Low | Medium | Pin version; maintain a forked patch branch. |
| Apple changes external-volume TCC semantics in macOS 15+ | Medium | High | Maintain a CI job that runs the app on latest macOS beta. |
| Anthropic changes OAuth-token storage format in Claude Code | Medium | Medium | `.claude/` is the abstraction; upgrade when CLI does. |
| Non-technical users can't understand "external drive" metaphor at all | Low | High | Pilot test onboarding with 5 non-CS students before Phase 6. |
| SSD fulfillment gets stuck in customs / shipping | Medium | Medium | Start SKU B only; delay SKU A until SKU B proves demand. |
| Competitor ships first (Cursor-for-students-on-a-drive) | Low | High | Keep the repo public from day one — community momentum is the moat. |
| You get tired of the product | Medium | Existential | Time-box Phase 6. If retention < 60% at exit, pivot or sunset. |

---

## 10. Immediate next actions

1. **Phase 0, day 1:** bootstrap `myhub-app/` Tauri project at SSD root, hello-world runs.
2. **Phase 0, day 2:** PTY hello-world — xterm.js renders `ls` output from `portable-pty`.
3. **Phase 0, day 3:** wire `bin/claude` into the PTY, confirm it respects `CLAUDE_CONFIG_DIR` and launches logged-in.
4. **Phase 0, week 1:** design spike (visual anchor, three Figma directions, decide).
5. **Phase 0, week 2:** write `docs/v4-design-spec.md` and `docs/v4-api-spec.md`. Freeze IPC.
6. **Phase 1, week 1:** tree pane wired to real FS reads.
7. **Phase 1, week 2:** editor pane (CodeMirror 6, read-only first).
8. **Phase 1, week 3:** editor writes + autosave + eject handling (Phase 1 MVP).

The only thing needed before I start Phase 0, day 1 is a yes on these four answers, or an explicit "you decide for v1, revisit at Phase 3." Auto mode default: proceed under the defaults listed in §7.

---

## Appendix A — v3 → v4 deltas at a glance

| v3 (today) | v4 (this plan) |
|---|---|
| Terminal-based TUI (Python, prompt_toolkit + rich) | Native-feel GUI (Tauri 2 + WKWebView) |
| Launch via Terminal.app window | Launch as `.app` bundle, no Terminal visible |
| Claude via `os.execvp` replaces TUI process | Claude runs in embedded PTY, GUI stays alive |
| One pane (project list) | Three panes (tree / editor / chat+terminal) |
| No markdown editor | CodeMirror 6 |
| No chat UI (only terminal REPL) | Chat pane + terminal pane |
| File tree: none, only flat project list | Filtered tree from `content/` |
| Updates: manual tarball over SSD | In-app signed-update check on mount |
| Supported: developers | Supported: non-technical Mac users |

## Appendix B — Things deliberately NOT in v4

- Vector embeddings / semantic search (still filesystem-is-source-of-truth, Karpathy wiki pattern).
- Cloud sync / multi-device sync.
- Plug-in marketplace. (Phase 8+.)
- Collaborative editing. (Not a v1 product.)
- iOS / iPadOS companion app. (Phase 9+.)
- AI models other than Claude. (Stay opinionated for now.)
