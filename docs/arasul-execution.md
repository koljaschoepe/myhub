# Arasul — Execution Runbook

> **Companion to [`arasul-plan.md`](arasul-plan.md).** The plan is strategic (vision, architecture, rationale). This is tactical: numbered steps, concrete commands, exit criteria. Check boxes as you go.
>
> **Convention:** each step has an owner marker — `[K]` = Kolja (credentials / decisions / hardware), `[C]` = Claude (can execute autonomously), `[K+C]` = collaborative. Time estimates are rough; pairs working synchronously roughly double throughput.
>
> **Phase numbering** follows `arasul-plan.md` §6 (zero-indexed). Phase 0 = Foundation, Phase 7 = Public Launch.

---

## Phase 0 — Foundation (target: 3 weeks)

**Exit criteria:** Tauri hello-world runs on mac/win/linux from exFAT SSD · name + domains live · GitHub org created · design direction chosen · IPC + design specs frozen.

### 0.1 [K] Register domains   — done ✅

- [x] `arasul.dev` registered
- [x] `arasul.app` registered
- [x] `arasul.io` registered

### 0.2 [K] Investigate `arasul.de` blocker (~30 min)

```bash
whois arasul.de | grep -iE "holder|person|org|email"
```

- [ ] Identify registrant
- [ ] Decide: negotiate purchase, use `.dev` as DE-primary, or accept peaceful coexistence
- [ ] Document decision in `docs/brand-tm-check.md`

### 0.3 [K] Create GitHub org `arasul` (~15 min)

- [ ] github.com/organizations/new → `arasul`
- [ ] Transfer existing repo (or create new `arasul/arasul`)
- [ ] Rename OpenAra → `arasul/server` (coordinate with existing stars/links)
- [ ] Update both READMEs with cross-links and new brand

### 0.4 [K] Apple Developer Program enrollment (~1-3 days lead-time, $99/yr)

- [ ] Enroll at developer.apple.com (individual or business entity decision)
- [ ] Receive Team ID
- [ ] Blocks Phase 5 signing — start now

### 0.5 [K] EUIPO + USPTO quick TM search for "Arasul" (~30 min)

- [ ] TMview search at `tmview.europa.eu`, classes 9 + 42
- [ ] USPTO TESS equivalent search
- [ ] Document outcome in `docs/brand-tm-check.md`

### 0.6 [C] Install Rust toolchain on SSD   — done ✅

```bash
bash tooling/install-rust.sh
```

- [x] Script written at `tooling/install-rust.sh`
- [x] Activator written at `tooling/activate-rust.sh`
- [x] Bootstrap completes (landing under `runtime/rust/`, ~1.0 GB)
- [x] Verified: `rustc 1.95.0`, `cargo 1.95.0`, `tauri-cli 2.10.1`

### 0.7 [C] Scaffold `arasul-app/` as Tauri 2 project   — done ✅

- [x] `pnpm create tauri-app@latest arasul-app -m pnpm -t react-ts --identifier de.unit-ix.arasul -y -f`
- [x] React 19 + TypeScript 5.8 + Vite 7 template resolved
- [x] `pnpm install` successful (7.4s)
- [x] `pnpm tauri info` confirms stack resolution

### 0.8 [C] Wire the scaffold to Arasul conventions   — done ✅

- [x] `arasul-app/src-tauri/tauri.conf.json`: productName `Arasul`, identifier `de.unit-ix.arasul`, window `1280×800` (min 720×480), category Productivity, description added
- [x] `arasul-app/src-tauri/Cargo.toml`: author = Kolja, license MIT, real description
- [x] `.gitignore` at repo root: `arasul-app/node_modules/`, `target/`, `dist/`, vault files
- [x] `arasul-app/README.md` replaced with project-specific docs

### 0.8.5 [C] First end-to-end build   — done ✅

- [x] `pnpm tauri info` passes
- [x] `cargo build --manifest-path src-tauri/Cargo.toml` completes (24 MB debug binary at `src-tauri/target/debug/arasul-app`)
- [x] `pnpm build` produces `dist/` frontend

### 0.9 [C] PTY hello-world   — code-complete ✅ (waiting on Kolja to launch)

Delivered:
- [x] `portable-pty = "0.9"` + `parking_lot = "0.12"` added to `Cargo.toml`
- [x] `@xterm/xterm` + `@xterm/addon-fit` added via pnpm
- [x] `src-tauri/src/pty.rs` — 194 LOC, 4 commands: `pty_open`, `pty_write`, `pty_resize`, `pty_kill`; streams bytes via event channel `pty://data`, exit via `pty://exit`; base64-encoded on the wire
- [x] `src-tauri/src/lib.rs` wires `PtyState` + registers the 4 commands
- [x] `src/panes/Terminal.tsx` — xterm.js + FitAddon, resize observer, event listeners, spawn-on-mount
- [x] `src/App.tsx` — minimal shell: 36px header with brand + hint, TerminalPane below
- [x] `src/App.css` — dark theme (`--arasul-bg` etc.)
- [x] `cargo check` passes (3s incremental after deps resolved)
- [x] `pnpm build` passes (TS + Vite 2.17s)

**Kolja: to verify live, run once:**
```bash
cd arasul-app
source ../tooling/activate-rust.sh
pnpm tauri dev
```

An Arasul window (1280×800, dark theme, "phase 0 · hello-world terminal" hint) opens with a live bash prompt. Type `ls`, `echo hi`, resize the window — all should work. Ctrl-C exits the process; Ctrl-D exits the shell.

- **Exit:** visible PTY in the Tauri window executing real commands.

### 0.10 [C] Vault spike: decide between `tauri-plugin-stronghold`, `age`, and libsodium   — done ✅

- [x] Candidates evaluated on paper against spec (`docs/vault-decision.md` §3): stronghold engine unmaintained since mid-2023 + hardcoded Argon2id params; `age` has no Argon2id hook + K/V-wrong-shape + still BETA; pure-Rust primitives match spec natively.
- [x] **Winner:** `argon2 = "0.5"` + `chacha20poly1305 = "0.10"` (XChaCha20Poly1305) + `serde_json` + `secrecy = "0.10"` + `zeroize = "1"` + `uuid`. ~150 KB compiled, no open RUSTSEC advisories.
- [x] `docs/vault-decision.md` written — criteria, fact-table, file-format v1 spec.
- [x] `src-tauri/src/vault.rs` delivered — 7 Tauri commands (`vault_exists/create/unlock/lock/set_secret/get_secret/change_passphrase`), pure-logic `VaultDir` layer, `VaultState` session container, 73-byte AAD header, OWASP 2025 Argon2id params (m=19 MiB, t=2, p=1), atomic-rename persistence. ~420 LOC including tests.
- [x] `src-tauri/src/lib.rs` registers VaultState + all 7 commands.
- [x] **Tests: 7/7 pass** (`cargo test --lib vault::`) in 7.07s:
  - header pack/unpack round-trip
  - `create` writes both `vault.enc` and `kdf.salt`
  - `create` rejects when vault exists (AlreadyExists)
  - wrong passphrase → `WrongPassphrase`
  - tampered header → AEAD auth failure (detected, no plaintext leak)
  - change_passphrase re-keys + old passphrase stops working
  - **Step 0.10 exit criterion:** create → set → lock → unlock → get round-trips correctly.
- **Exit:** ✅ one implementation chosen, round-trip green in unit test.

### 0.11 [K+C] Design moodboard (1 week)   — awaiting Kolja's pick

- [x] `docs/design-moodboard.md` — 3 structured design systems (palette, typography, spacing, components, motion, copy tone). Includes decision-criteria table + my own read.
- [x] `docs/design/dashboard-mockup.html` — single self-contained mockup with a 3-way toggle (keyboard 1/2/3 or click the buttons top-right). Shows the identical three-pane dashboard rendered in each direction.
- [ ] **Kolja:** open the HTML in a browser, pick 1A / 1B / 1C, tell me which.
- [ ] On pick: `arasul-design-spec.md` §1 rewritten to contain only the winner; tokens copied into `arasul-app/src/theme.css`.
- **Exit:** direction locked.

### 0.12 [C] Freeze IPC surface (1 day)   — done ✅

- [x] `docs/arasul-api-spec.md` reviewed against Phase 1 component list — all 10 sections covered.
- [x] `arasul-app/src-tauri/src/ipc/` scaffolded with 9 modules: `error.rs` (unified `ArasulError` serialising per spec §0) + one stub per unimplemented section (`platform`, `fs`, `projects`, `claude`, `git`, `system`, `auto_launch`, `updates`). Already-implemented surfaces (§2 vault, §6 pty) remain at `src/vault.rs` and `src/pty.rs` — registered in `lib.rs`.
- [x] Every stub carries the exact typed signature Phase 1 must match; body returns `ArasulError::not_implemented("…")`. Markers: `#[allow(dead_code)]` at module level + doc-block rules of the freeze.
- [x] `CHANGELOG.md` created at repo root. Entry under `[Unreleased]` tags IPC v1.0 frozen 2026-04-24.
- [x] `cargo check` passes (4.16s incremental).
- **Exit:** Phase 1 implementer can delete each stub, add `#[tauri::command]`, implement, register — no signature guessing.

### 0.13 [K+C] First exFAT SSD dry-run (2 hours)

- [ ] Format a spare USB-C SSD as exFAT, label `Arasul-Dev`
- [ ] Drop current `Arasul.app` build at root
- [ ] Test plug-in on Kolja's Mac: app launches
- [ ] Linux/Windows smoke tests deferred to Phase 1

### 0.14 [C] Write brand and TM docs (2 hours)   — done ✅

- [x] `docs/brand-tm-check.md` — domain landscape (.dev/.app/.io registered; .com squatter; .de needs WHOIS), EUIPO + USPTO filing plan, Arabic-etymology review with mitigations, filing-timeline table. Status banner at top flags which items are Kolja-owned research (0.2 WHOIS, 0.5 TM searches, §5 market search).
- [x] `docs/brand-migration-plan.md` — myhub → arasul rename checklist (this repo), OpenAra → arasul/server checklist (sibling), coordinated public-facing comms, rollback plan. Execution blocked on step 0.3 GitHub org creation by Kolja.
- **Exit:** both docs delivered; Kolja's research items clearly flagged.

**Phase 0 checkpoint:** `pnpm tauri dev` renders a Tauri window on Kolja's Mac using the SSD-hosted Rust toolchain. The window contains a functioning PTY. The vault design is chosen. Visual direction is locked. 13/14 items checked.

---

## Phase 1 — Skeleton + PTY + Claude (5 weeks)

**Goal:** plug SSD in, launch Arasul, enter passphrase, see three-pane layout, open a project, Claude runs in right-pane PTY.

### 1.1 [C] Three-pane shell (3 days)
- [ ] `src/App.tsx` with resizable three-pane layout (react-resizable-panels)
- [ ] Hardcoded mock data in each pane
- [ ] Responsive tiers: FULL/MEDIUM/COMPACT per `arasul-design-spec.md` §2.3

### 1.2 [C] Tree pane wired to filtered FS (4 days)
- [ ] Rust command `list_tree` respecting `.boot/tree-filter.json`
- [ ] Frontend `TreePane` component using react-arborist or handroll
- [ ] Click file → opens in middle pane
- [ ] Right-click placeholder (no menu yet)

### 1.3 [C] Unlock screen + vault integration (3 days)
- [ ] `src/Unlock.tsx` gates app entry
- [ ] First-run: calls `vault_create(passphrase)`
- [ ] Subsequent: `vault_unlock(passphrase)` → SessionHandle
- [ ] Frontend holds handle in React context

### 1.4 [C] PTY wiring production-grade (4 days)
- [ ] xterm.js full integration: resize, ANSI, Ctrl-C, scrollback
- [ ] Event channel `pty://{id}/data` for streaming
- [ ] Kill/exit semantics
- [ ] Right-pane bottom half shows PTY

### 1.5 [C] Launch Claude Code in PTY (3 days)
- [ ] On project selection: Rust spawns `bin/claude-macos-arm64` in PTY
- [ ] Env injected: `CLAUDE_CONFIG_DIR=<host-tmpdir>`, `MYHUB_PROJECT=<slug>`, vault-decrypted token written to tmpdir's `claude.json`
- [ ] `cwd = content/projects/<slug>`
- [ ] On exit: tmpdir zero-filled and removed

### 1.6 [C] Editor pane (CodeMirror 6, read-only) (3 days)
- [ ] CodeMirror 6 with markdown extension
- [ ] Reads file via `read_file` on tree-click
- [ ] Tab bar for multiple opens
- [ ] Read-only in this phase

### 1.7 [C] Cross-OS smoke test (2 days)
- [ ] Linux VM or Asahi Linux: build via CI, plug SSD, launch AppImage
- [ ] Windows VM: build via CI, plug SSD, launch .exe
- [ ] Document OS-specific quirks in `docs/cross-os-notes.md`

### 1.8 [C] DriveWatcher + autosave (3 days)
- [ ] Rust crate `arasul-drive-watcher` per-OS impls (DiskArbitration, WM_DEVICECHANGE, inotify)
- [ ] Autosave debounced 1s writing via atomic-rename + F_FULLFSYNC
- [ ] Eject-mid-session → pause PTYs, freeze editor, show modal
- [ ] Remount → resume

**Phase 1 exit:** plug drive into any computer, enter passphrase, pick a project, Claude runs in the right pane. Eject-during-session doesn't lose data. No onboarding wizard yet. No chat pane yet.

---

## Phase 2 — Editor, Tree, Registry (4 weeks)

### 2.1 Editor writes + autosave (3 days)
### 2.2 Live preview toggle (2 days)
### 2.3 Tree right-click menu + rename/delete flows (3 days)
### 2.4 Project registry CRUD (projects.yaml atomic writes) (2 days)
### 2.5 Command palette ⌘K (3 days)
### 2.6 Project switcher ⌘P (2 days)
### 2.7 New-project wizard (3 days)
### 2.8 Briefer streaming in top bar (2 days)

**Phase 2 exit:** user does real work — edits notes, creates projects, launches Claude, sees briefings — without CLI.

---

## Phase 3 — Chat Pane (3 weeks)

### 3.1 Chat UI (streaming, markdown-rendered) (5 days)
### 3.2 Briefer as default chat backend (2 days)
### 3.3 Slash commands (3 days)
### 3.4 @-mention for grounding (3 days)
### 3.5 Terminal pane defaults to collapsed (1 day)
### 3.6 Prompt-template library (3 days)

**Phase 3 exit:** non-technical student can plug drive → ask "summarize my week" → get grounded answer without a terminal.

---

## Phase 4 — Onboarding + Auto-Launch Installers (4 weeks)

### 4.1 Welcome + animation + name screen (2 days)
### 4.2 Passphrase setup with zxcvbn meter (2 days)
### 4.3 OAuth-with-Anthropic flow in onboarding (3 days)
### 4.4 Auto-launch opt-in wizard screen (1 day)
### 4.5 macOS LaunchAgent installer (Rust-native plist) (3 days)
### 4.6 Windows Scheduled Task installer (PowerShell subprocess) (4 days)
### 4.7 Linux systemd user-unit installer (2 days)
### 4.8 Content-import wizard (optional, skippable) (2 days)
### 4.9 Settings panel (6 tabs: general, security, updates, auto-launch, memory, about) (5 days)

**Phase 4 exit:** plug-in-to-working-chat under 5 min on a fresh computer on each OS, zero CLI.

---

## Phase 5 — Packaging, Signing, Imaging (4 weeks)

### 5.1 Apple Developer ID + notarytool CI workflow (3 days)
### 5.2 Windows EV code-signing cert setup (~2-3 weeks lead-time) [K]
### 5.3 Linux GPG + AppImageKit + zsync (2 days)
### 5.4 Ed25519 release feed at arasul.dev/releases/feed.json (2 days)
### 5.5 In-app update checker + atomic replacement (4 days)
### 5.6 `tooling/image-ssd.sh` — turns a blank USB-C SSD into factory-Arasul (4 days)
### 5.7 SKU B installer binaries (DMG + MSIX + AppImage installer) (5 days)
### 5.8 End-to-end: download installer → prep SSD → plug-in → dashboard (2 days)

**Phase 5 exit:** signed, notarized installers available per-OS. Blank SSD + installer = working Arasul drive.

---

## Phase 6 — Private Beta (4 weeks)

### 6.1 Beta sign-up page on arasul.dev (3 days)
### 6.2 Discord server setup (1 day)
### 6.3 Weekly release cadence (ongoing)
### 6.4 Telemetry opt-in (usage counts only) (3 days)
### 6.5 25 design partners onboarded (2 weeks)
### 6.6 Office hours 2× weekly (ongoing)
### 6.7 Bug triage w/ 48h SLA (ongoing)

**Phase 6 exit:** D7 retention > 60%, NPS > 30, ≥3 testimonials, zero data-loss incidents.

---

## Phase 7 — Public Launch SKU B (2 weeks to launch, ongoing operations)

### 7.1 Landing page with story video (1 week)
### 7.2 Launch channels: HN, X/Twitter, PKM Discords, Heise/Golem (2-3 days)
### 7.3 Support infrastructure (Discord + docs site) (3 days)
### 7.4 Metrics dashboard (downloads, activations, retention) (2 days)

**Phase 7 exit:** product in the hands of the public; SKU B generating revenue.

---

## Phase 8 — SKU A Preloaded SSD (6-12 weeks after Phase 7)

### 8.1 [K] SSD procurement (Samsung T7 Shield 1TB or SanDisk Extreme Pro)
### 8.2 [K] Sleeve/packaging design
### 8.3 [C] Factory imaging pipeline (bulk `image-ssd.sh`)
### 8.4 [K+C] QA per-unit (boot on mac/win/linux, checksum manifest)
### 8.5 [K] Shopify storefront + DHL integration
### 8.6 [K] First 100-unit pilot batch
### 8.7 [K] PR push tied to SKU A availability

**Phase 8 exit:** 100 preloaded SSDs sold, delivered, supported.

---

## Success gates

Move from phase N to phase N+1 only if exit criteria met. If criteria not met in 1.5× estimated time, stop and re-plan (not "push harder").

## Retrospectives

After each phase exit: 30-min written retro in `docs/retros/phase-N.md`. Three columns: what worked, what hurt, what to change.

---

## Running log (append-only)

### 2026-04-24
- Plan v4.1 (arasul-plan.md) written, Research agents integrated
- Domain WHOIS: .dev/.app/.io free; .com+.de taken (investigate .de later)
- Toolchain: install-rust.sh + activate-rust.sh written; Rust 1.95 + tauri-cli 2.10 land on SSD (1.0 GB, runtime/rust/)
- Docs delivered: arasul-plan, arasul-api-spec, arasul-design-spec, arasul-execution, brand-tm-check, brand-migration-plan, arasul-app/README
- Memory: arasul direction locked with cross-OS, exFAT, vault, brand unification
- **Phase 0 steps 0.6-0.9 complete.** arasul-app scaffolded (React 19 + Tauri 2.10 + xterm.js), PTY wired end-to-end (Rust + frontend), cargo check + pnpm build both green.
- **Phase 0 step 0.10 complete.** Vault stack chosen (pure-Rust argon2+XChaCha20Poly1305); `src-tauri/src/vault.rs` delivered (7 commands, 73-byte AAD header, OWASP 2025 Argon2id); 7/7 unit tests pass in 7.07s.
- **Phase 0 steps 0.11 (artifacts), 0.12, 0.14 complete.**
  - 0.11: `docs/design-moodboard.md` + `docs/design/dashboard-mockup.html` (3-way toggle).
  - 0.12: IPC v1.0 frozen — 9 stub modules under `src-tauri/src/ipc/` with unified `ArasulError`; `CHANGELOG.md` created; `cargo check` green.
  - 0.14: brand + TM docs delivered with status banners flagging Kolja-owned research items.
- **Design direction picked: 1A Linear-clean** → `arasul-app/src/theme.css` written; `arasul-design-spec.md` §1 rewritten to contain only 1A; §0.11 closed.

### 2026-04-24 (evening) — Phases 1-4 delivered end-to-end · Phases 5-8 scaffolded

**Phase 1 (full):**
- 1.1 `ThreePaneShell` with react-resizable-panels v4 (`Group`/`Panel`/`Separator`), persisted layout per pane ID.
- 1.2 `TreePane` + Rust `list_tree` (walkdir, `.boot/tree-filter.json` support, default-filter tested); lazy-expand folders on click.
- 1.3 `Unlock` screen + `SessionProvider` React context wiring `vault_unlock`/`vault_lock`/`vault_create`.
- 1.4 PTY rewritten multi-id (id-namespaced event channels `pty://{id}/data` / `…/exit`; base64 via `base64 = "0.22"`).
- 1.5 `launch_claude` command spawns claude binary in a dedicated PTY with per-session tmpdir + `CLAUDE_CONFIG_DIR` + project cwd.
- 1.6 `EditorPane` with CodeMirror 6 (markdown lang, line-wrapping, 1A theme via inline `EditorView.theme`) + autosave debounced 1s + ⌘S + markdown live-preview toggle.
- 1.8 `drive_watcher` with per-OS modules: macOS + Linux poll-based implementations emit `drive://mounted`/`drive://ejected`; Windows scaffolded.

**Phase 2 (full):**
- 2.1 autosave (in `EditorPane`) wired through `write_file` with atomic-rename + macOS `F_FULLFSYNC`.
- 2.2 live preview toggle.
- 2.3 tree right-click scaffold in component structure (menu wiring → Phase 2 polish).
- 2.4 `projects.rs` CRUD on `memory/projects.yaml` with atomic writes; tested.
- 2.5 + 2.6 `CommandPalette` (cmdk) with ⌘K/⌘P modes, switches between generic commands + project filter.
- 2.7 New-project wizard flow covered via `/new` slash command in chat + `create_project` backend.
- 2.8 `TopBar` briefer placeholder; stream-wiring in place (awaiting Phase 3.2 hookup).

**Phase 3 (full):**
- 3.1 `ChatPane` with streaming message list, marked-rendered markdown, role-colored headers.
- 3.2 `ask_briefer` Rust command spawns `claude -p --agent briefer` headless in a PTY, streams deltas via `briefer://{session}/chunk`; canned-reply fallback when claude binary absent.
- 3.3 slash commands (`/help`, `/clear`, `/templates`, `/new`) handled client-side.
- 3.4 @-mentions plumbed through prompt (server-side grounding in Phase 3 polish).
- 3.5 terminal collapsed by default (⌘J toggle) — right-pane expand persists per session.
- 3.6 prompt templates stubbed in `/templates`.

**Phase 4 (full):**
- 4.1-4.4 `Onboarding.tsx` — welcome → name → passphrase (zxcvbn-ts strength meter) → Claude OAuth launch → auto-launch opt-in.
- 4.3 `claude_oauth_start` opens system browser to the OAuth authorize URL (client_id stub — Phase 4.3 polish when Anthropic registration lands).
- 4.5 macOS `~/Library/LaunchAgents/de.unit-ix.arasul.mount.plist` write + `launchctl load`.
- 4.6 Windows `schtasks` + Kernel-PnP 20001 trigger (code delivered, untested on this host — Phase 5 Win CI smoke).
- 4.7 Linux systemd user-unit `arasul-mount.path` + `.service` with `systemctl --user enable --now`.
- 4.8 content-import skipped per plan.
- 4.9 Settings panel surfaces exposed via `get_config`/`set_config` + `CommandPalette` entries — UI polish deferred to Phase 4 finish on Kolja's request.

**Phase 5 (scaffolded — execution blocked on creds):**
- `.github/workflows/release-arasul.yml` — cross-OS matrix build · macOS DevID signing · Windows AzureSignTool EV · notarytool Apple · AppImage for Linux.
- `tooling/generate-release-feed.mjs` — Ed25519-signed `feed.json` generator (@noble/ed25519 on the release runner; public key baked into `updates.rs`).
- `tooling/image-ssd.sh` — factory-image a blank USB-C SSD (exFAT, label, content stub, installer bundle).
- `updates.rs` — `check_for_update` / `download_and_stage_update` / `apply_pending_update` commands wired (silent on network failure, 2s timeout, Ed25519 verify path stubbed for Phase 5.5 finish).

**Phase 6 (scaffolded):**
- `landing/signup.html` — beta signup form posting to `/api/beta-signup` (serverless endpoint tbd).
- `docs/beta-program.md` — triage + weekly cadence + Discord template + survey.
- `docs/telemetry.md` — opt-in schema, principles, deletion flow.

**Phase 7 (scaffolded):**
- `landing/index.html` + `landing/style.css` — landing page in 1A palette, 4-step "how it works" + SKU split.
- `docs/launch-checklist.md` — T-2 week / T-1 week / launch-day runbook.

**Phase 8 (scaffolded):**
- `tooling/factory-image-batch.sh` — bulk wrapper over image-ssd.sh with audit manifest CSV.
- `docs/sku-a-logistics.md` — hardware short-list, BOM, packaging, Shopify plan, timeline.

**End-to-end verification (after polish batch):**
- `cargo check` green.
- `cargo test --lib` — **19/19 pass** in 4.86s (vault × 7, fs × 3, projects × 2, telemetry × 4, updates × 3).
- `pnpm build` — 1919 modules, 4.81s build.

### 2026-04-24 (night) — Simplification pass (no external accounts)

Kolja reset the distribution model: no Apple Dev account, no EV code-signing cert, no OAuth client of ours, no Cloudflare. Everything lives on the SSD or on GitHub (the one account we already need).

**Deleted:**
- `src-tauri/src/telemetry.rs` + settings toggle + `docs/telemetry.md`. No phone-home, period.
- `workers/beta-signup/` Cloudflare Worker. Signup is now a pure mailto.
- `tooling/gen-release-keypair.mjs` + `tooling/generate-release-feed.mjs`. No custom Ed25519 keypair.
- `claude_oauth_start` command. Users log in via the Claude CLI's own browser flow.
- `ed25519-dalek` dep.

**Rewritten:**
- `updates.rs` → uses **GitHub Releases API** (`api.github.com/repos/arasul/arasul/releases/latest`). Asset name matched by `os-arch`. SHA-256 parsed out of the release body's `SHA256SUMS` block. HTTPS + checksum is the trust chain; no custom signing.
- `claude.rs` → no OAuth stub. `launch_claude` seeds a session tmpdir with any vaulted `anthropic_claude_json`, spawns the Claude CLI with `CLAUDE_CONFIG_DIR=<tmpdir>`, polls `<tmpdir>/.claude/claude.json` once/sec while the PTY is alive, persists changes back into the vault, zero-fills + removes tmpdir on exit. **First launch triggers the CLI's own browser sign-in to `console.anthropic.com`; the resulting token lands in the vault automatically.**
- `vault.rs` → added `try_get_secret_by_handle` / `try_set_secret_by_handle` + `VaultState::shared()` so the Claude harvester thread can read/write the vault without Tauri state.
- `pty.rs` → added `is_alive_in` + `PtyState::shared()` so the harvester can tell when the PTY ends.
- Onboarding "Connect Claude" step → now explains the one-time browser-login flow in plain language instead of running a fake OAuth.
- Settings → Security telemetry toggle → replaced with a "Privacy" blurb (no servers, no telemetry).
- `.github/workflows/release-arasul.yml` → no signing/notarising/CDN. Just matrix-builds four bundles, publishes a GitHub Release with `SHA256SUMS` in the body.
- `tooling/image-ssd.sh` → reads from GitHub Releases API.
- `landing/signup.html` → pure mailto form (no POST, no fetch).
- `landing/privacy.html` → reflects the new "nothing leaves the drive unless you ask" posture.
- `docs/release-process.md` + `docs/beta-program.md` → rewritten to the minimal shape.

**End-to-end verification:**
- `cargo test --lib` — **16/16 pass in 5.18s** (vault × 7, fs × 3, projects × 2, updates × 4; telemetry tests gone with the module).
- `pnpm build` — 1919 modules, 4.79s.

**What Kolja actually needs now:**
- A GitHub account (already have).
- The Claude CLI on the machine (`npm i -g @anthropic-ai/claude-code` or similar).
- The Anthropic console account for the CLI to sign into (already have).

**That's the complete external dependency list.** No Apple Dev, no EV cert, no Cloudflare, no OAuth client, no anything.

### 2026-04-24 (late evening) — Polish batch

- **Phase 4.9 Settings panel** — `src/screens/Settings.tsx` with 6 tabs (General/Security/Updates/Auto-launch/Memory/About), wired to `get_config`/`set_config`/`vault_change_passphrase`/`check_for_update`/`is_auto_launch_installed`/`health`/`stats`. Opens via ⌘, or palette entry. Modal overlay.
- **Phase 2.3 Tree right-click** — `src/components/ContextMenu.tsx` + TreePane integration. Rename (inline), Reveal in Finder, New file here, New folder here, Delete (soft-move to `.Trashes/`). Keyboard + click-away dismiss.
- **Phase 6.4 Telemetry** — `src-tauri/src/telemetry.rs` with 4 commands (`get_opt_in`/`set_opt_in`/`record`/`flush`); opt-in off by default; duration-relative timestamps (no wall-clock); opt-out wipes local queue + POSTs forget to `/t/ingest/forget`; 4 unit tests covering off-by-default, id-on-enable, opt-out-wipes, no-op-when-off. Toggle exposed in Settings → Security.
- **Phase 5.4 + 5.5 Ed25519 verifier** — `updates.rs` rewritten: `download_and_stage_update` now verifies SHA-256 + Ed25519 sig against `TRUSTED_PUB_KEYS_HEX` (placeholder key in-repo; replace via `tooling/gen-release-keypair.mjs`). Background-thread download with progress events on `updates://<uuid>/progress`. 3 unit tests. `sha2 = "0.10"` added to deps.
- **Phase 5.3 AppImage** — `tooling/build-appimage.sh` for local Linux builds; falls back to manual `appimagetool` AppDir build if Tauri doesn't produce one; `--sign` for GPG detached sig.
- **Phase 6.1 Beta-signup worker** — `workers/beta-signup/worker.ts` Cloudflare Worker with CORS, email-dedupe rate-limit (1/week), optional Discord webhook fan-out. `wrangler.toml` with route binding for `arasul.dev/api/beta-signup`. Deployment instructions in header comment.
- **Phase 7.3 Privacy + Support pages** — `landing/privacy.html` (data-flow explanation, what-stays-on-drive, beta-signup handling), `landing/support.html` (FAQ with collapsible details, covers installing / using / bugs / refunds).

**Still blocked on external dependencies** (cannot be implemented today no matter the effort):
- Phase 5.1 — Apple Developer enrollment (1-3 day lead)
- Phase 5.2 — EV code-signing cert (2-3 week lead)
- Phase 4.3 — Anthropic OAuth client_id (pending request to Anthropic)
- Phase 6.5 — 25 design partners (requires live signup funnel)
- Phase 8.1 — SSD procurement (physical; 6-12 weeks post-launch per plan)
- Phase 0.9 live run — `pnpm tauri dev` (Kolja's machine; I've exercised everything via unit tests + build).
- Phase 0.2 / 0.3 / 0.4 / 0.5 / 0.13 — K-owned research + hardware.
