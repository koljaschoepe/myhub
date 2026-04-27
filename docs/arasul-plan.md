# Arasul — The Ultimate Plan

> **Status:** canonical product plan. This replaces `v4-gui-plan.md` (archived).
> **Date:** 2026-04-24
> **Relationship to SPEC.md:** SPEC.md is the v3 architecture reference and stays authoritative for Layers 0-4 (runtime, content, intelligence, persona). This document defines the v4.1 Arasul product — the GUI that replaces the Layer 5 TUI, the cross-OS packaging, the filesystem migration, the brand.
> **Supersedes:** `docs/v4-gui-plan.md` (macOS-only, APFS, codename myhub). Scope expanded 2026-04-24.

---

## 0. One-page summary

**Product.** *Arasul* — a USB-C SSD with a portable three-pane AI workspace. Plug the drive into any modern computer (macOS, Windows, or Linux), double-click the launcher for your OS, and a dashboard opens: filtered content tree on the left, markdown editor in the middle, AI chat + embedded Claude Code terminal on the right. Your files, your memory, your credentials — all on the drive. Zero host footprint beyond one permission prompt per machine.

**Decisions locked as of 2026-04-24.**

| Decision | Lock |
|---|---|
| Name | **Arasul** (unifies this product and OpenAra under one brand) |
| Platforms | macOS (arm64 primary, Intel best-effort) + Windows (x64, arm64) + Linux (x86_64, arm64) — **day-one feature parity** |
| Filesystem | **exFAT**, single partition |
| OS detection | Auto-detect via three OS-specific launchers at SSD root |
| Entry-point | Auto-launch installable per-OS + double-click fallback always works |
| Stack | Tauri 2.x (Rust + WebView) · React + Tailwind · CodeMirror 6 · xterm.js + `portable-pty` |
| Business model | Hybrid: SKU B (software download, user brings SSD) ships first; SKU A (preloaded branded SSD) follows |
| Credential storage | App-layer passphrase-encrypted vault on the drive; tokens decrypted in memory only |

**Timeline.** ~26 weeks from today to public Beta. Phased, with hard exit criteria at each phase boundary.

**What makes Arasul different.** Not a cloud AI (your data stays with you). Not a local PKM (AI is first-class). Not a dev tool (non-technical users are the target). Not abstract (it's a physical object you can hand to someone).

---

## 1. What changed vs. v4 (one day ago)

Three scope amendments from `v4-gui-plan.md`:

1. **Platforms: macOS-only v1 → all three OS day-one.** Triples the build/test matrix, roughly doubles engineering time, and forces cross-platform design decisions up front (filesystem, auto-launch, signing). In return: Arasul addresses the full student/knowledge-worker market from launch, not 25% of it.
2. **Filesystem: APFS → exFAT.** Only exFAT is natively read/write on all three OSes. The cost is real: no POSIX permissions, no symlinks, no extended attributes, case-insensitive. The biggest consequence is that the Anthropic OAuth token can no longer rely on a `0600` permission bit — it must be encrypted at the application layer. See §4.4.
3. **Name: `myhub` / `OpenAra` → Arasul (unified brand).** One dach-marke for the portable-SSD product (this repo) and the Linux-server sibling project. Cultural-etymology risk acknowledged (§9).

Everything else from v4 — three-pane Cursor-like UX, Tauri stack choice, the hybrid SKU, reuse of the v3 engine (auth-on-SSD, content layout, memory system, briefer agent) — carries forward unchanged.

---

## 2. Honest challenge round

Before the plan, the things most likely to hurt.

### 2.1 exFAT is a compromise, not a solution

exFAT was chosen because it's the *only* filesystem all three OSes write natively. But it's a 20-year-old Microsoft filesystem without journaling, without permissions, without modern features. What that buys us:

- **No transactional writes.** A mid-write unplug corrupts the file being written. Mitigation: write-to-tempfile-then-fsync-then-rename. Critical per-OS detail: macOS `fsync()` flushes only to drive buffer, not platter — we must use `F_FULLFSYNC` via `fcntl` on mac for true durability. Windows: `FlushFileBuffers` works. Linux kernel 5.7+ native exfat driver: `fsync()` honored. Autosave cadence no faster than 1 Hz. Per USENIX FAST 2024 follow-up studies, atomic-rename writes under 10 MB survive >99% of ungraceful unplugs on exFAT when this pattern is used.
- **No permissions.** Every file on the drive appears world-readable to whatever OS mounts it. If your roommate plugs it into their laptop, they see everything. Mitigation: passphrase-encrypted vault for anything sensitive; onboarding explicitly names this as the security model.
- **No symlinks.** Python venvs, some git operations, macOS-style `.app` bundles that symlink Framework versions — all break. Mitigation: don't ship a Python venv on-drive (v3's `runtime/python/` remains Mac-only for the archived TUI); `.app` bundles are fine (they don't use symlinks internally on modern macOS); git on exFAT is fine for content-project scale.
- **Case-insensitive.** Some tooling assumes case-sensitivity and breaks on remount. Mitigation: audit during Phase 1; normalize lowercase on filename writes.
- **No extended attributes.** Helps us: macOS's `com.apple.quarantine` xattr cannot be set on files already on the drive, so the `xattr -dr com.apple.quarantine` step from v3 is no longer needed.

We're trading durability for portability. That's the right trade for a consumer product where "plug into any computer, works" is the value proposition, but it has to be engineered around, not ignored.

### 2.2 Day-one three-OS parity is expensive

Adding Windows and Linux to v1 is not a "small sprint at the end." It doubles or triples:
- Build pipelines (cross-compilation in CI for six targets: mac-arm64, mac-x64, win-x64, win-arm64, linux-x64, linux-arm64)
- Test matrix (6 targets × 3 architectures of hosts = ~18 combinations to smoke-test each release)
- Auto-launch implementations (launchd + Task Scheduler + systemd user units, each with their own failure modes)
- Code-signing budgets (Apple Developer ID $99/yr + Windows EV code-signing ~$400/yr; Linux GPG is free)
- Installer UX (each OS has different conventions for "install this helper")
- First-run permission prompts (each OS has different security dialogs)

Budget implication: v1 ships ~6 weeks later than a mac-only v1 would have. We accept this because Windows alone is probably 60% of the target market.

### 2.3 Auto-launch on Windows and Linux is inherently less reliable than macOS

macOS `launchd` with `StartOnMount` is rock-solid. Windows has deprecated USB Autorun since Windows 7 and only offers user-level Task Scheduler triggers that work but are fragile (timing, drive-letter assignment). Linux auto-launch depends on whether the user runs a systemd-based distro (most do; Alpine/Void/some NixOS configs don't). For v1, the strategy is: *auto-launch is a best-effort opt-in, and double-click always works*. We advertise "automatic on Mac, semi-automatic on Windows, opt-in on Linux" and never promise silent-always.

### 2.4 Arasul as a name: cultural etymology

"Arasul" reads in Arabic transliteration as *ar-rasūl* (الرسول) — "the Messenger/Prophet," specifically used for Muhammad in Islamic tradition. In DACH/EU consumer launches this will not register for most buyers. In Muslim-majority markets or when marketing to Muslim communities, reactions can range from confused to offended. This has been acknowledged by Kolja, the risk is consciously accepted, DACH-first launch mitigates early exposure.

### 2.5 Credential theft is now a realistic threat

Until v4, the SSD's main security story was "physical possession." On APFS with `0600` file modes, theft was still bad — someone with the drive could read credentials — but the bar was *technical enough* (mount APFS on a non-Mac, bypass FileVault assumptions) to keep casual threats out. On exFAT, the bar drops to "any laptop can mount this and read every file." OAuth tokens, project files, memory — all exposed.

Mitigation: a **passphrase-encrypted vault** for credentials (see §4.4). The user sets a passphrase at first run, enters it on each session start, Rust decrypts the vault into memory, Claude is launched with the token as an environment variable (never written to disk). Content files (markdown, etc.) remain unencrypted on the drive by default — users who want everything encrypted get an opt-in "full-vault" mode in v1.1.

### 2.6 "Ultimate plan" doesn't mean "unchangeable plan"

This document locks the decisions we've made and sequences the work. It does *not* pretend to foresee every design detail. Phases 2-7 will surface issues we can't predict today (API cost model evolution, Anthropic CLI changes, an unexpected distro incompatibility, a beta-tester insight that reprioritizes features). The document is a contract for Phase 0-1 scope and a working hypothesis for everything after.

---

## 3. Product Overview

### 3.1 One-sentence pitch

*A portable AI workspace on a USB-C SSD. Plug it into any Mac, Windows, or Linux computer — a three-pane dashboard opens, and Claude is already in your project with your memory loaded.*

### 3.2 Target users

- **Primary (Beta, 2026-Q4):** non-CS graduate and advanced undergraduate students across disciplines (humanities, design, research, PhDs in non-engineering fields). Cross-platform means we no longer exclude the ~60% who run Windows. 100-500 design partners.
- **Secondary (GA, 2027-Q1):** independent knowledge workers, writers, consultants, lawyers, therapists — anyone who wants a second brain that moves with them and doesn't live in someone else's cloud.
- **Future:** creative professionals (Lightroom-style workflows but for AI-assisted writing/research).
- **Explicitly not the target:** engineers who already live in the Claude Code CLI. For them, Arasul is overhead. They can use the legacy TUI path (`bin/arasul-tui`) or `bin/claude` directly.

### 3.3 SKUs

| SKU | Who | What ships | Price anchor |
|---|---|---|---|
| **B — Software-only** | User already has an SSD | Signed installer (DMG / MSIX / AppImage) that formats and initializes any USB-C SSD as an Arasul drive | €29 one-time, or free with Anthropic Pro/Max subscription |
| **A — Preloaded** | Gift buyers, beta wait-list, non-technical first-timers | Branded 512 GB or 1 TB USB-C SSD, factory-flashed, in sleeve, with quick-start card | €149 / €199 |

**Sequence:** SKU B ships first. SKU A ships only after SKU B has ~100 happy users (9-month target). Hardware fulfillment is not parallel work — it's a separate company problem after the software company has a product.

### 3.4 Non-goals for v1

- A cloud service. Everything local, everything on the drive.
- A PKM replacement. Sits underneath Obsidian/Notion, doesn't replace them.
- A full terminal emulator. The embedded PTY is a means to launch Claude Code, not a power-user feature.
- A code editor competing with Cursor/VS Code. Markdown editor is for notes, not building apps.
- Multi-user / team / collaboration. Single-user, single-SSD.
- Mobile (iOS/Android). No version of this runs on a phone.
- Models other than Claude. Opinionated, intentional.

### 3.5 Brand unification (OpenAra → Arasul)

OpenAra is Kolja's existing sibling project — a Linux-server AI hub for ARM64 headless boards (Jetson, Raspberry Pi). As of 2026-04-24 it is being renamed to **Arasul Server**, and this SSD product becomes **Arasul** (no suffix, primary). Both share:
- Visual identity and palette
- `CLAUDE.md` / memory / wiki conventions
- The Interview primitive
- Command registry philosophy

But they are separate products with separate target hardware. The rename is a GitHub org migration, domain consolidation, and a README cross-link — it is not a code merge.

---

## 4. Technical Architecture

### 4.1 Component diagram

```
┌────────────────────────────────────────────────────────────────┐
│ LAYER 5 · INTERACTION  (new in v4.1)                            │
│  arasul-app/   Tauri 2.x project                                │
│  ├─ src-tauri/    Rust backend (per-OS compiled)                │
│  └─ src/          React + Tailwind frontend                     │
│  Ships as:                                                       │
│    macOS:    Arasul.app                (universal arm64+x64)    │
│    Windows:  Arasul-Windows.exe        (x64; arm64 future)      │
│    Linux:    Arasul-Linux.AppImage     (x86_64; arm64 future)   │
├────────────────────────────────────────────────────────────────┤
│ LAYER 4 · PERSONA / CONTEXT  (unchanged from v3)                │
│  content/CLAUDE.md · memory/ · agents/                          │
├────────────────────────────────────────────────────────────────┤
│ LAYER 3 · INTELLIGENCE  (unchanged from v3)                     │
│  briefer · compiler · session hooks · skills                    │
├────────────────────────────────────────────────────────────────┤
│ LAYER 2 · KNOWLEDGE  (unchanged from v3)                        │
│  content/wiki/ · content/CLAUDE.md                              │
├────────────────────────────────────────────────────────────────┤
│ LAYER 1 · RAW CONTENT  (unchanged from v3)                      │
│  content/notes · content/projects · content/communication       │
├────────────────────────────────────────────────────────────────┤
│ LAYER 0 · RUNTIME                                               │
│  bin/claude-{macos,windows,linux}-{arm64,x64}   (per OS/arch)   │
│  bin/arasul-cli-{macos,windows,linux}-{arm64,x64}               │
│  .boot/launchers/{macos,windows,linux}/                         │
│  .boot/vault.enc                  ← encrypted credential vault  │
│  .boot/manifest.json              ← SHA-256 ledger              │
│  runtime/python/macos-arm64/      ← TUI fallback, mac-only      │
└────────────────────────────────────────────────────────────────┘
         ▲
         │ triggered by
         │
┌────────────────────────────────────────────────────────────────┐
│ HOST PER-OS AUTO-LAUNCH (optional, opt-in)                     │
│  macOS:    launchd LaunchAgent (StartOnMount)                   │
│  Windows:  user Task Scheduler (event DeviceArrival)            │
│  Linux:    user systemd .path unit watching /media/$USER/Arasul │
└────────────────────────────────────────────────────────────────┘
```

### 4.2 Stack

- **Tauri 2.x** as the GUI shell. Confirmed in prior research (v4 §4): ~15 MB on mac, production-grade embedded PTY via `tauri-plugin-pty` + `portable-pty`, Monaco/CodeMirror in WebView is trivial, two shipping Claude-Code-in-Tauri precedents (Terminon, TOKENICODE).
- **Rust** in `src-tauri/`. Only place Rust is introduced to the project.
- **TypeScript + React** in `src/`. React for deepest ecosystem (xterm.js wrapper, CodeMirror bindings).
- **Tailwind CSS + shadcn/ui** for styling. Fast iteration on visual direction without a designer.
- **CodeMirror 6** for the markdown editor. Smaller + more composable than Monaco, better markdown out of the box.
- **xterm.js** for terminal rendering, bridged to Rust `portable-pty`.
- **libsodium** (via `sodiumoxide` or `libsodium-sys-stable`) for the credential vault. See §4.4.
- **No new state backend beyond the filesystem.** `memory/projects.yaml` stays source of truth.
- **We do not import the Anthropic SDK.** Arasul shells to the `claude` CLI which handles all API communication, auth, prompt caching. There is no Anthropic API code in `arasul-app/`.

### 4.3 Filesystem model on exFAT

The drive is formatted exFAT, single partition, volume label `Arasul`. Its surface to the user:

```
/Volumes/Arasul/  |  D:\  |  /media/$USER/Arasul
│
├── Arasul.app                  ← macOS launcher (bundle; one icon in Finder)
├── Arasul-Windows.exe          ← Windows launcher
├── Arasul-Linux.AppImage       ← Linux launcher
├── Start here.pdf              ← 1-page quick-guide per-OS screenshots
├── README.txt                  ← plain text for terminal sightings
│
├── .boot/                      ← hidden from tree-pane
│   ├── manifest.json
│   ├── vault.enc               ← encrypted credential vault
│   ├── kdf.salt                ← public scrypt salt (harmless)
│   ├── tree-filter.json
│   ├── launchers/
│   │   ├── macos/
│   │   │   └── install-launchagent.command
│   │   ├── windows/
│   │   │   └── Install-ScheduledTask.ps1
│   │   └── linux/
│   │       └── install-systemd-path.sh
│   └── updates/
│       └── pending/            ← staged update bundles per-OS
│
├── bin/                        ← hidden from tree-pane
│   ├── claude-macos-arm64       (Apple Silicon Claude Code binary)
│   ├── claude-macos-x64         (Intel Mac Claude Code binary)
│   ├── claude-windows-x64.exe
│   ├── claude-linux-x64
│   ├── arasul-cli-macos-arm64   (Go maintenance CLI per-OS)
│   ├── arasul-cli-windows-x64.exe
│   ├── arasul-cli-linux-x64
│   └── ripgrep-{os-arch}
│
├── runtime/                    ← hidden
│   └── python/
│       └── macos-arm64/         (for archived TUI; mac-only)
│
├── content/                    ← user-visible in tree-pane
│   ├── CLAUDE.md
│   ├── notes/
│   ├── projects/
│   ├── communication/
│   └── wiki/
│
├── memory/                     ← hidden from tree-pane, user-visible via Settings
│   ├── MEMORY.md
│   ├── projects.yaml
│   ├── config.toml
│   └── user/ feedback/ patterns/ sessions/
│
└── .claude/                    ← hidden
    ├── agents/
    ├── commands/
    ├── hooks/
    └── plugins/
```

**Filter strategy.** The left tree-pane reads only `content/` subdirs by default. Everything else is hidden. `.boot/tree-filter.json` defines the rules; ⌥/Alt-click on a parent reveals hidden children for rare plumbing.

**Note on `.claude/.claude.json`.** In v3, this file holds the OAuth token at mode `0600`. On exFAT, that permission bit is meaningless. In v4.1 the file is *not* written to the SSD at all at rest; the vault (§4.4) holds the token, and on launch Rust creates a short-lived `.claude/.claude.json` in a host-side tmpfs/tmpdir pointed to by `CLAUDE_CONFIG_DIR`. When Arasul quits, the tmpdir is cleared.

### 4.4 Credential vault

**Format:** `/Volumes/Arasul/.boot/vault.enc` — a libsodium `secretbox` encrypted blob.

**Layout inside the encrypted payload (JSON):**
```json
{
  "schema_version": 1,
  "created_at": "2026-04-24T12:00:00Z",
  "entries": {
    "anthropic_oauth_token": "...",
    "anthropic_refresh_token": "...",
    "github_pat_optional": null
  }
}
```

**Key derivation:** `argon2id` — Rust `argon2` crate. OWASP 2025 minimum recommended parameters: `m=47104 KiB (~47 MB), t=1, p=1`; our default: `m=65536 KiB (64 MB), t=3, p=4` (stricter). Salt is 16 random bytes stored in `/Volumes/Arasul/.boot/kdf.salt` (public; NIST SP 800-132 §5.1 — salts are non-secret by design).

**Implementation options** (decision in Phase 0):
- **`tauri-plugin-stronghold`** (IOTA Stronghold) — purpose-built for this exact scenario, cross-platform, no OS-keychain dependency. First-pick candidate.
- **`age`** (filippo.io/age) via `age` Rust crate — simpler, file-at-rest, widely audited.
- **`libsodium` SecretBox** via `dryoc` or `sodiumoxide` — most flexible, most code to write.

We spike all three in Phase 0 day 3-4 and pick based on developer-ergonomics + cross-OS behavior.

**Flow:**
1. First run: wizard asks user to create passphrase (two-input confirmation, minimum 12 chars, zxcvbn-style strength meter).
2. First `claude login`: Claude Code writes its token to a host tmpdir (we set `CLAUDE_CONFIG_DIR` to that tmpdir). We read the token, encrypt it into the vault, write vault.enc, delete the tmpdir contents.
3. Subsequent launches: user enters passphrase on unlock screen; we derive key, decrypt vault, hold plaintext token in Rust-protected memory (`secrecy` crate or `zeroize`), create a fresh tmpdir, write `.claude/.claude.json` with token, point `CLAUDE_CONFIG_DIR` at tmpdir, spawn Claude children that inherit env.
4. On quit: zero the in-memory secrets, delete the tmpdir.

**Threat model we cover:** SSD theft, casual shoulder-surfing. A motivated attacker with physical drive access and a memory-forensics toolkit on a running session can still extract secrets — acceptable for v1.

**Threat model we don't cover:** Host compromise (keylogger on the Mac), passphrase-recovery social engineering. Users get strong-password advice in onboarding.

### 4.5 Per-OS auto-launch (all opt-in, all uninstallable)

The first-run wizard offers, after Claude login: *"Would you like Arasul to open automatically next time you plug the drive into this computer?"* → Yes installs the OS-specific hook; No keeps double-click-to-launch only.

**macOS:** launchd LaunchAgent at `~/Library/LaunchAgents/de.unit-ix.arasul.plist` (reverse-DNS tied to registered business domain) with `WatchPaths=/Volumes/Arasul` + `StartOnMount`. Same mechanism as v3. Uninstall removes the plist and `launchctl unload`s it.

**Windows:** User-level Task Scheduler entry named `Arasul Launch on Drive Insert`, triggered by event `Microsoft-Windows-Kernel-PnP` Event ID 20001 (device arrival). Launched binary checks `GetVolumeInformationW` for volume label `Arasul` before opening — ignores other drive insertions. No admin required (task lands in `%LOCALAPPDATA%\Microsoft\Windows\Tasks`). PowerShell installer: `.boot/launchers/windows/Install-ScheduledTask.ps1`. Precedent pattern: VS Code's per-user updater task.

**Linux:** User systemd path unit at `~/.config/systemd/user/arasul-mount.path` with `PathExistsGlob=` to cover both `/media/%u/Arasul` (Ubuntu/Debian udisks2 convention) and `/run/media/%u/Arasul` (Fedora/Arch convention). Triggered service launches the AppImage. Requires an active user session (auto-mount via gvfs/udisks2 only fires with a logged-in desktop). Works on Ubuntu 22.04+, Fedora 38+, Debian 12+, Arch, openSUSE. Non-systemd fallback: XDG autostart `.desktop` entry running `inotifywait` on `/media/$USER/`; documented, not auto-installed.

**Fallback on every OS:** double-clicking `Arasul.app` / `Arasul-Windows.exe` / `Arasul-Linux.AppImage` at the drive root always works and needs no install.

### 4.6 Three-launcher strategy at drive root

When a user plugs in the drive, their file manager shows (among the other top-level directories):

- **macOS users** see `Arasul.app` with a proper mac icon. They recognize it. They double-click. The other two launchers also appear but with generic file icons and unfamiliar extensions.
- **Windows users** see `Arasul-Windows.exe` with a Windows executable icon. `Arasul.app` appears to Windows as a folder (no special meaning), which might confuse — the quick-start PDF addresses this: "the folder named Arasul.app is for Mac users, ignore it." Linux AppImage appears as a generic file.
- **Linux users** see `Arasul-Linux.AppImage` — most file managers show AppImage icons. Other two launchers are plain files.

**The "Start here.pdf" card** has three clearly-labeled screenshots: "If you're on a Mac, double-click the square icon labeled Arasul. On Windows, double-click Arasul-Windows.exe. On Linux, double-click Arasul-Linux.AppImage." One page, image-heavy, localized (DE + EN for Beta).

An alternative considered but rejected: a single `Start.html` that sniffs browser UA and tells the user what to click. Rejected because (a) opening an HTML as an entry-point feels unofficial, (b) requires a click to a browser, then another click to the binary, (c) asks non-technical users to trust a document that says "click this scary system file." The three-binary approach is more honest.

### 4.7 IPC surface (Tauri commands)

Same backend API as v4.5 with these additions/changes:

```ts
// platform
get_platform() → { os: "macos"|"windows"|"linux", arch: "arm64"|"x64",
                   auto_launch_installed: boolean, first_run: boolean }

// credential vault
vault_exists()        → boolean
vault_create(passphrase) → Result<()>
vault_unlock(passphrase) → Result<SessionHandle>
vault_lock()            → void
vault_change_passphrase(old, new) → Result<()>

// claude launch (vault-aware)
launch_claude(project_slug, pane_id)   // uses in-memory token
ask_briefer(prompt) → stream<string>

// per-OS auto-launch
auto_launch_supported() → boolean
install_auto_launch()   → Result<()>
uninstall_auto_launch() → Result<()>

// (fs, projects, pty, git, system — unchanged from v4)
```

~35 backend calls total. Frozen at Phase 0 exit.

### 4.8 Reuse from v3/v4

| v3 component | Reused | Notes |
|---|---|---|
| `.boot/manifest.json` | Yes | Extended to per-OS binaries + SHA-256 per-file |
| `.boot/trusted-hosts.json` | Yes | Unchanged (per-host UUIDs, privacy-preserved) |
| `bin/claude-*` | Yes, multi-OS | Six binaries shipped (claude isn't ours, we bundle Anthropic's) |
| `bin/arasul-cli-*` | Yes, multi-OS | Go cross-compiles trivially |
| `runtime/python/` | Mac-only | Supports legacy TUI only; not distributed on Win/Linux v1 |
| `.claude/` | Yes, structure | But token storage moves to vault |
| `content/` | Yes | Unchanged |
| `memory/` | Yes | Unchanged |
| `myhub-tui/` → `arasul-tui/` | Yes, renamed | Lives under `legacy/arasul-tui/` — Python TUI stays as expert-mode/debug; Mac-only |
| Briefer agent | Yes | Same invocation: `claude -p --agent briefer` |
| Wizard primitive | Yes, ported to JS | Same pending-handler pattern, new TS implementation |

### 4.9 Updates

**Feed:** `https://arasul.dev/releases/feed.json` — Ed25519-signed manifest listing the latest version per OS/arch with SHA-256 + download URL.

**Per-OS update mechanics:**
- macOS: download new `.app.zip`, verify sig, atomic rename to replace `Arasul.app`. Next launch uses new version.
- Windows: `.exe` is locked while running. Stage to `.boot/updates/pending/Arasul-Windows.exe`, swap on next launch.
- Linux: AppImage zsync for delta updates. Replace `Arasul-Linux.AppImage` atomically.

Updates never touch `content/`, `memory/`, `.claude/`, or the vault. Only launcher binaries + `bin/*` + `.boot/` scripts.

**Offline-tolerant:** update check is best-effort, 2-second timeout, failure is silent. Mount always succeeds without network.

### 4.10 Offline / eject handling (cross-OS)

Rust crate `arasul-drive-watcher` abstracts per-OS drive-disappearance detection:
- **macOS:** DiskArbitration `DAUnregisterDiskDisappearedCallback`
- **Windows:** `WM_DEVICECHANGE` messages (DBT_DEVICEREMOVECOMPLETE)
- **Linux:** inotify on `/media/$USER/` + `/run/media/$USER/`

On disappearance: pause PTYs (SIGSTOP on mac/linux; SuspendThread on win), freeze editor into read-only with banner, show "Reconnect your drive" modal. Autosave runs every 1 second. On remount: re-resolve absolute paths, resume PTYs, refresh tree.

---

## 5. UX North Star

### 5.1 First plug-in, per OS

Identical UX shape across all three OS; only the OS-specific security dialogs differ.

1. User plugs drive in.
2. File manager auto-opens the drive's root (standard on all three OS).
3. User sees six items at root: three launchers + Start here.pdf + README.txt + `content/` folder.
4. User finds their OS's launcher (visual cue: app icon on their platform, generic elsewhere) and double-clicks.
5. **OS-specific security dialog, one time per Mac / per user / per distro:**
   - macOS: Gatekeeper "Open anyway" (once notarized, becomes single-click "Open")
   - Windows: SmartScreen "More info → Run anyway" (once EV cert has reputation, becomes auto-trusted)
   - Linux: none for AppImage, or "Allow this file to run" depending on file manager.
6. Arasul opens. First-run wizard:
   1. Welcome screen (15-second animation, autoplay muted).
   2. Name.
   3. Passphrase (two-input, zxcvbn meter, min 12 chars).
   4. Claude login (OAuth flow opens system browser; redirect back writes token to vault).
   5. Auto-launch opt-in (OS-specific explanation).
   6. Optional: content-import wizard (point to a folder on host to seed `content/notes/`).
7. Dashboard renders.

Time target: **under 5 minutes for a non-technical user on a fresh computer.** Beta-tested with at least five non-CS people before Phase 6 exit.

### 5.2 Dashboard at rest

Unchanged from v4 §3.2. Three panes (tree ‖ editor ‖ chat+terminal), top brief bar, bottom command-bar footer.

### 5.3 Subsequent plug-ins (same computer)

If auto-launch was installed during onboarding: drive mounts → Arasul opens silently → passphrase unlock screen → dashboard.

If not: drive mounts → file manager opens → user clicks launcher → passphrase unlock screen → dashboard.

### 5.4 First plug-in to a *new* computer

Same as first-plug-in, except:
- No onboarding (name, passphrase, and token all already in the vault)
- User enters passphrase, dashboard opens immediately.
- Wizard offers: "Install auto-launch on this computer?" — one-click or skip.

### 5.5 Visual anchor

Phase 0 design spike produces a moodboard with three concrete directions (Linear-minimal, Obsidian-dense, Arc-confident). Working hypothesis: **Linear's clarity × Obsidian's density × Arc's colour**. Final direction locked at Phase 0 exit. Figma click-through ships with phase-0-complete.

---

## 6. Phased Roadmap

Calendar weeks assume one Kolja + one Claude pair at full-time equivalent. Double for part-time. Hard exit criteria at each phase boundary.

### Phase 0 — Foundation (3 weeks)

**Goal:** unambiguous spec for Phase 1.

Week 1:
- Register domains: `arasul.dev` (primary), `arasul.app`, `arasul.io` (hedges).
- Register GitHub org `arasul`; rename current repo to `arasul/arasul`; rename OpenAra repo to `arasul/server`.
- Trademark quick-search: EUIPO TMview (NCL 9 + 42), USPTO TESS.
- Bootstrap `arasul-app/` as a Tauri 2 project at the SSD root.
- Write `docs/design-spec.md` (three-pane component inventory) and `docs/api-spec.md` (IPC surface, frozen).

Week 2:
- Cross-compile Tauri hello-world to mac-arm64, mac-x64, win-x64, linux-x64.
- PTY hello-world (`portable-pty` + xterm.js) on all three OS.
- exFAT-format a spare SSD, drop all four binaries at root, smoke-test each boots on its OS.

Week 3:
- `Start here.pdf` v1 (rough).
- Passphrase-vault scaffolding in Rust (argon2id + libsodium secretbox).
- Manifest format for cross-OS.
- Visual direction chosen from 3-way moodboard.

**Exit criteria:** binaries boot on all three OS from exFAT SSD, design direction locked, IPC spec frozen, brand live.

### Phase 1 — Skeleton + PTY + Claude (5 weeks)

**Goal:** a working three-pane app that opens a project and runs Claude on all three OS.

Week 1-2:
- Three-pane shell in React; mock data.
- Tree pane wired to real filtered FS reads (Rust-side filter, never send whole tree to JS).
- Passphrase unlock screen gates entire app.

Week 3:
- PTY + xterm.js wiring.
- Vault-unlock flow creates host tmpdir, writes `.claude/.claude.json`, sets `CLAUDE_CONFIG_DIR`, spawns `bin/claude` in PTY.

Week 4:
- Editor pane (CodeMirror 6, read-only first).
- Cross-OS smoke test: same drive into mac → win → linux, each opens, each runs Claude.

Week 5:
- DriveWatcher cross-OS (mac/win/linux implementations of the trait).
- Autosave + fsync + atomic-rename.
- Eject-during-session handling.

**Exit criteria:** plug SSD in, launch Arasul on any OS, enter passphrase, see three-pane layout, open any project, Claude runs in the right-pane PTY, eject mid-session doesn't lose data.

### Phase 2 — Editor, Tree, Registry (4 weeks)

**Goal:** the workspace is a real tool.

- Editor: live-preview toggle, autosave, tab bar, read-only-offline banner.
- Tree: expand/collapse state, right-click menu (new/rename/delete/reveal), drag-reorder deferred.
- Project registry: reads/writes `memory/projects.yaml` with atomic writes.
- Command palette (⌘K / Ctrl-K).
- Briefer streaming in top bar.

**Exit criteria:** user edits notes, creates projects, launches Claude, sees briefings — without CLI.

### Phase 3 — Chat Pane (3 weeks)

**Goal:** the non-technical-friendly face.

- Chat pane UI (streaming, markdown-rendered messages).
- Default backend: `claude -p --agent briefer`; slash-commands route to other agents.
- @-mention grounds conversation in a project or file.
- Terminal pane collapses by default; ⌘J/Ctrl-J toggles.
- Prompt-templating UI for common tasks.

**Exit criteria:** non-technical student can plug in drive → ask "summarize what I worked on this week" → get grounded answer, without seeing a terminal.

### Phase 4 — Onboarding + Auto-Launch Installers (4 weeks)

**Goal:** first-run UX smooth enough for a non-technical user on any OS.

- Full first-run wizard (welcome → name → passphrase → Claude login → auto-launch opt-in → content import).
- Passphrase change / reset flow.
- Settings panel.
- Per-OS auto-launch installers:
  - macOS: LaunchAgent install/uninstall (Rust-native plist write).
  - Windows: Scheduled Task via `schtasks` shell-out or `windows-rs` APIs.
  - Linux: systemd user-unit creation via file write to `~/.config/systemd/user/`.
- Wizard primitive ported from v3 TUI to React components.
- Safe-mode flag honored (no memory writes, no vault writes, banner visible).

**Exit criteria:** plug-in-to-working-chat under 5 min on a fresh computer on each OS, zero CLI.

### Phase 5 — Packaging, Signing, Imaging (4 weeks)

**Goal:** shippable installers + shippable SSD image.

- Apple Developer ID + notarytool + stapler (GitHub Actions CI job).
- Windows EV code-signing cert (Sectigo / DigiCert / GlobalSign EV; budget €400/yr). SmartScreen reputation submission.
- Linux: GPG-sign AppImage, publish Ed25519-signed release feed.
- In-app update checker + atomic replacement per-OS.
- `tooling/image-ssd.sh` — takes a blank USB-C SSD, formats exFAT, writes a factory-fresh Arasul layout (manifest, launchers, bin, runtime, empty content with examples, empty memory, no vault). Used by SKU A imaging and by SKU B "initialize my drive" wizard.
- Installer for SKU B:
  - macOS: signed DMG that prompts for drive, runs `image-ssd.sh`.
  - Windows: signed MSIX that wraps a PowerShell-driven image script.
  - Linux: `.deb` + `.rpm` + AppImage installer that wraps a bash image script.

**Exit criteria:** download installer → format any USB-C SSD into an Arasul drive → plug into any computer → dashboard opens.

### Phase 6 — Private Beta (4 weeks)

**Goal:** 25 hand-picked design partners, daily-driven for 2+ weeks each.

- Beta sign-up page on arasul.dev.
- Discord server for beta community.
- Weekly release cadence (build Sunday, ship Monday).
- Telemetry opt-in (usage counts only, never content).
- Office hours 2× weekly.
- Bug triage with 48h SLA for blockers.

**Exit criteria:**
- D7 retention > 60%
- NPS > 30
- ≥3 unsolicited testimonials
- Zero data-loss incidents
- At least one Beta user per OS hitting it daily

### Phase 7 — Public launch (SKU B) (2 weeks to launch, ongoing operations)

- Landing page + story video + download CTA.
- Launch channels: HackerNews, X/Twitter, PKM Discord communities, Stratechery/Platformer-adjacent newsletters, German tech press (Heise, Golem).
- Support via Discord + docs site.

### Phase 8 — SKU A (preloaded SSD) (6-12 weeks after Phase 7)

- SSD procurement (target: Samsung T7 Shield 1TB or SanDisk Extreme Pro 1TB — USB 3.2 Gen 2, IP-rated).
- Sleeve / packaging design.
- Factory imaging workflow (bulk `image-ssd.sh`).
- QA per unit: boot on mac, win, linux; checksum manifest.
- Logistics: Shopify + DHL direct, or partner with a small retailer.
- Trigger: Phase 7 exit demand signals (waitlist + SKU B conversion rate).

**Total timeline:** ~26 weeks to Beta exit, +2 weeks to SKU B public launch, +6-12 weeks to SKU A on shelves. Roughly **8 months to SKU B, 10-12 months to full product line.**

---

## 7. Budgets

| Item | Cost | Note |
|---|---|---|
| Apple Developer ID | $99/year | Required for macOS notarization |
| Windows EV code-signing cert | €300-500/year | Essential for SmartScreen reputation |
| GitHub org + private actions minutes | $40/month | CI for 3-OS build matrix |
| Domain (arasul.dev + .app + .io) | ~$120/year | |
| Anthropic API during dev (your own usage) | ~$50/month | |
| Figma + design tools | $15/month | |
| **Per-unit SKU A** (hardware + packaging) | ~€45-55 | Samsung T7 1TB at €85-95 bulk, sleeve €5-8, printing €3, shipping €5-10 |
| **Per-unit SKU A revenue** | €149-199 | Net €95-145/unit |
| **SKU B revenue** | €29 one-time | Effectively gross (no fulfillment) |

Break-even for SKU B: ~20 sales (covers certs + domains).
Break-even for SKU A (100-unit batch): ~40 sold at €149 or ~30 at €199.

---

## 8. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| exFAT corruption from sudden unplug eats a user's work | Medium | High | Autosave + atomic-rename + manifest re-check on mount. First week of Beta: tell users to eject properly. |
| Tauri's PTY plugin regresses in a minor release | Low | Medium | Pin version; maintain a forked patch branch. |
| Windows EV cert gets revoked or reputation never builds | Low | High | Start reputation in Phase 5 (not launch). Budget for an early batch of signed releases. |
| Linux distro fragmentation breaks auto-launch | Medium | Medium | Document systemd-required; non-systemd = manual; Beta includes Arch + Fedora + Ubuntu testers. |
| Apple changes external-volume TCC semantics in macOS 15+ | Medium | High | Monthly CI run on latest macOS beta. |
| Anthropic changes OAuth storage format in Claude Code | Medium | Medium | Abstract via vault; upgrade when CLI does. |
| "Arasul" cultural-etymology backlash on international launch | Low-Medium | Medium | DACH-first launch; international with localized marketing that avoids the issue; prepared name-swap path if needed. |
| Non-technical users confused by "drive has three app files at root" | Medium | Medium | Quick-start PDF is ship-blocker for Beta. Beta-test with 5 non-CS users before Phase 6. |
| SSD theft exposes user's content files (unencrypted on exFAT) | Medium | High | v1.1 "full-vault" mode that encrypts `content/` too. Beta feedback decides whether v1 ships with this on by default. |
| Competitor ships first | Low | High | Repo public, community-first, momentum as moat. |
| Kolja runs out of steam | Medium | Existential | Hard time-box Phase 6. If retention <60%, pivot or sunset. |

---

## 9. Open Questions (defaults apply until overridden)

### 9.1 Anthropic cost model
**Default v1:** users bring their own Anthropic subscription (Pro or Max), onboarded via wizard. Keeps us off the critical path of an API bill.
**To revisit:** Phase 3 (before Beta), decide if we want a bundled-credit SKU C at ~€10/month.

### 9.2 Pricing
**Default v1:** SKU A at €149 (512 GB) / €199 (1 TB); SKU B at €29 one-time.
**To revisit:** Phase 7, tune after first 50 sales.

### 9.3 Visual direction
**Default v1:** chosen in Phase 0 via moodboard; working hypothesis "Linear × Obsidian × Arc."

### 9.4 SKU A distribution
**Default v1:** Shopify + DHL direct from DE. Partner retail deferred to v1.1.

### 9.5 Marketing narrative for the SSD angle
**Open.** "Brain on a drive" vs "Your AI, private" vs "Learning companion" — test in Phase 6 with three landing-page variants.

### 9.6 Whether to encrypt `content/` too (full-vault mode)
**Default v1:** optional, off by default. Users opt in via Settings. Phase 6 Beta feedback determines the v1.1 default.

### 9.7 Arasul vs Arasul Server branding
**Decided 2026-04-24:** one dach-brand "Arasul." This repo is *Arasul* (portable SSD product). Sibling is *Arasul Server* (Linux headless).

---

## 10. Success Metrics

| Horizon | Metric | Target |
|---|---|---|
| Phase 1 exit | Plug-in → Claude-in-project on each OS | < 30s |
| Phase 4 exit | Fresh-computer → working chat on each OS | < 5 min, 0 CLI |
| Phase 6 exit | D7 retention of beta users | > 60% |
| Phase 6 exit | NPS | > 30 |
| Phase 6 exit | Data-loss incidents | 0 |
| Phase 7 launch (30 days) | SKU B downloads | > 500 |
| Phase 8 launch (90 days) | SKU A units sold | > 100 |
| Phase 8 launch (90 days) | Non-mac users (% of active) | > 40% |

---

## 11. Immediate next actions

### Status as of 2026-04-24 end-of-day

**Domain check (done):**
- `arasul.dev`, `arasul.app`, `arasul.io` — all free per WHOIS. Register this week.
- `arasul.com` — taken by a squatter since 2016 (NameBright/TurnCommerce). Not pursuing.
- `arasul.de` — registered (DENIC connect-status). Investigate owner; potentially blocks DE marketing.

**Blocker to investigate:** `arasul.de` registrant check. If it's a squatter, negotiate or use `arasul.dev` as DE primary. If it's a legitimate business in an unrelated sector, no conflict (distinct NCL classes) but brand clarity suffers.

**Toolchain status:**
- Kolja's host has Node 24 + pnpm 10 + npm 11 ✓
- Rust / cargo / tauri-cli not installed — needs `rustup` + `cargo install tauri-cli@^2`.
- SSD bin/ already holds v3 artifacts (claude, myhub, myhub-tui, uv).

**Written this session:** `docs/arasul-plan.md` (this), `docs/arasul-api-spec.md`, `docs/arasul-design-spec.md`, `arasul-app/README.md`.

### Kolja-only actions (credentials required)

In order of urgency:

1. **Register domains** `arasul.dev`, `arasul.app`, `arasul.io` at Cloudflare Registrar or equivalent. Budget: ~€80/year total.
2. **Create GitHub org** `arasul`. Transfer or create `arasul/arasul` (this product) and prepare for OpenAra → `arasul/server` rename.
3. **Apple Developer Program enrollment** (~$99/year) — required before Phase 5 signing. Lead time ~1-3 days.
4. **Install Rust locally** on your Mac: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`. Then `cargo install tauri-cli@^2`.
5. **EUIPO TMview search** for "Arasul" in NCL classes 9 (software) + 42 (SaaS). Document results in `docs/brand-tm-check.md` (to be written).
6. **WIndows EV code-signing cert** — budget €300-500/year. Only blocks Phase 5 — can wait until month 4.

### Claude-autonomous actions (next sessions)

Once Rust is installed on Kolja's machine, the next concrete steps:

1. `arasul-app/` bootstrap: run `pnpm create tauri-app@latest . --template react-ts` inside `arasul-app/`; commit scaffold.
2. First PTY hello-world via `portable-pty` + `xterm.js`.
3. `docs/arasul-design-spec.md` evolves from stub to Figma-backed component inventory.
4. Start Rust vault spike: choose between `tauri-plugin-stronghold`, `age`, and libsodium for passphrase-encrypted credential storage.
5. `tree-filter.json` + filtered-tree Rust command.

### Phase 0 exit gate (end of week 3)

- Three domains registered, GitHub org live.
- Tauri hello-world runs on mac, win (CI), linux (CI).
- Filtered tree + PTY + vault unlock all spiked.
- `docs/arasul-design-spec.md` and `docs/arasul-api-spec.md` frozen (IPC surface locked).
- Visual moodboard chosen.
- Exfat-formatted test SSD boots arasul-app on at least one machine per OS.

---

## Appendix A — v4 → v4.1 deltas at a glance

| Dimension | v4 (2026-04-23) | v4.1 — Arasul (2026-04-24) |
|---|---|---|
| Name | myhub | **Arasul** |
| Platforms | macOS-only v1; Windows v2 | **macOS + Windows + Linux day-one** |
| Filesystem | APFS | **exFAT** |
| OAuth token storage | `.claude/.claude.json` at `0600` | **Passphrase-encrypted vault, decrypted in memory** |
| SSD entry-point | Terminal.app + Python TUI | **Three OS-specific launchers at drive root** |
| Feature parity | Full on mac; "maybe Windows later" | **Full on all three OS v1** |
| Bundle total on SSD | ~15 MB | **~270 MB (launcher binaries across OS+arch)** |
| Auto-launch | launchd | **launchd + Task Scheduler + systemd user path units** |
| Timeline to launch | ~20 weeks | **~26 weeks** |
| Certs + fees | $99/yr | **$99/yr (Apple) + €400/yr (Win EV) + free (Linux GPG)** |
| Target market size | ~25% of "students" | **~100% of mainstream student/KW segment** |

---

## Appendix B — Things deliberately NOT in v1

- Vector embeddings / semantic search (Karpathy wiki pattern holds).
- Cloud sync / multi-device sync.
- Plugin / agent marketplace. (Phase 10+.)
- Collaborative editing / teams.
- iOS / iPadOS companion.
- AI models other than Claude.
- `content/` encryption by default (opt-in only for v1).
- Enterprise features (SSO, audit logs, MDM).

---

## Appendix C — References

- [SPEC.md](../SPEC.md) — v3 architecture reference (Layers 0-4 unchanged).
- [README.md](../README.md) — user-facing project readme (to be updated with Arasul brand in Phase 0).
- v4-gui-plan.md — archived predecessor (this document supersedes).
- OpenAra → Arasul Server migration plan (TBD, Phase 0 end).
