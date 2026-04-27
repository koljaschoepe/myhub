# Arasul — Design Specification

> **Status:** stub (Phase 0 Week 3 deliverable). Will evolve through Phase 0; frozen at Phase 0 exit.
> **Source of truth for visuals:** Figma file (TBD, Phase 0 Week 2).
> **Source of truth for copy:** this document.

This document defines the visual and interaction design for the Arasul GUI. It is paired with `arasul-api-spec.md` (backend) and references `arasul-plan.md` (strategic).

---

## 1. Visual direction — LOCKED 2026-04-24 → **1A Linear-clean**

Arasul is a serious professional tool. Quiet, precise, the chrome disappears and the content is the hero. Inspiration anchors: Linear.app, Things 3, Bear, Figma comments pane.

**Design tokens live at `arasul-app/src/theme.css`** — that file is the source of truth. Any visual change MUST go through these tokens, never hex directly in components.

### 1.1 Palette

| Token               | Value       | Usage                              |
|---------------------|-------------|-------------------------------------|
| `--bg-canvas`       | `#0E0F11`   | app background                      |
| `--bg-pane`         | `#15171B`   | pane surfaces                       |
| `--bg-elevated`     | `#1C1F25`   | menus, hover surfaces               |
| `--border-subtle`   | `#232730`   | pane dividers, 1px                  |
| `--border-strong`   | `#303640`   | focused inputs, active tabs         |
| `--text-primary`    | `#E6E8EC`   | body                                |
| `--text-secondary`  | `#9AA0AB`   | labels, timestamps                  |
| `--text-tertiary`   | `#636976`   | metadata, disabled                  |
| `--accent`          | `#7C8FFC`   | single accent — links, focus, CTAs  |
| `--accent-soft`     | `#7C8FFC22` | selected row background             |
| `--danger`          | `#E55C5C`   | destructive actions only            |
| `--success`         | `#62C98A`   | saved/confirmed states              |

### 1.2 Typography

- **Sans:** Geist → Inter → system-ui fallback
- **Mono:** Geist Mono → SF Mono → Consolas
- **Scale:** 11 / 12 / 13 / 14 / 16 / 20 / 28
- **Weights:** 400 body, 500 UI, 600 headings. No 700.

### 1.3 Spacing + density

- Base unit 4px. Row height 28px in tree, 32px in editor tab bar.
- Pane padding `var(--pane-pad-x)` 16px / `var(--pane-pad-y)` 12px.
- Tight but not cramped — Linear's inbox calibration.

### 1.4 Components + motion

- **Borders over shadows** — 1px `--border-subtle` lines, no drop shadows beyond focus rings.
- **Hover** = 4% white overlay. **Press** = 8%.
- **Focus ring:** 2px `--accent` + 4px soft halo (`--focus-ring` token).
- **Buttons:** ghost-first. Primary button only at CTAs (onboarding, vault create).
- **Icons:** Lucide 16/20px, 1.5px stroke, `--text-secondary`.
- **Motion:** 120ms ease on state changes. No shimmer, no bounce, no gradient sweeps. `prefers-reduced-motion` honoured.

### 1.5 Copy tone (see also §5.1)

Professional colleague who doesn't waste words. Direct second-person. Errors explain, never blame.

---

## 2. Information architecture

### 2.1 Top-level views

| View | Trigger | Purpose |
|---|---|---|
| **Unlock** | App start, no session | Passphrase entry |
| **Onboarding** | First run post-unlock OR new Mac | Welcome → name → claude login → auto-launch opt-in |
| **Dashboard** | Post-unlock, onboarded | Main three-pane workspace |
| **Settings** | ⌘, | Config, passphrase, auto-launch, update, memory browser |
| **Command palette** | ⌘K | Any command from `arasul-api-spec.md` |
| **Project switcher** | ⌘P | Fuzzy-match project list |

### 2.2 Dashboard panes

```
┌─ Top bar ───────────────────────────────────────────────────────────┐
│ [Briefer stream, collapsible]                            [update?]  │
├─── Left ──┬─── Middle ───────────────────┬─── Right ───────────────┤
│ Tree      │ Editor (CodeMirror 6)         │ Chat (streaming)         │
│ filtered  │ ┌─────────────────────────┐   │ ┌─────────────────────┐ │
│ from      │ │  tab bar                │   │ │ messages            │ │
│ content/  │ ├─────────────────────────┤   │ │                     │ │
│           │ │                         │   │ │                     │ │
│ ▼ notes   │ │  live editor area       │   │ │                     │ │
│ ▼ proj…   │ │                         │   │ └─────────────────────┘ │
│ ▼ comms   │ │                         │   │ ┌ chat input ─────────┐ │
│           │ │                         │   │ │ @project to ground  │ │
│           │ │                         │   │ └─────────────────────┘ │
│           │ │                         │   ├──────────────────────────┤
│           │ │                         │   │ Terminal (xterm.js)       │
│           │ │                         │   │ collapsed by default      │
│           │ │                         │   │ ▼ ⌘J to expand            │
├───────────┴───────────────────────────┴──────────────────────────────┤
│ ⌘P proj · ⌘N new · ⌘K cmd · ⌘⇧C claude · ⌘J term · ⌘, settings      │
└──────────────────────────────────────────────────────────────────────┘
```

### 2.3 Responsive tiers (from v3 TUI)

| Tier | Min width | Changes |
|---|---|---|
| FULL | ≥1280 | All panes at designed widths (tree 240 · editor flex · right 380) |
| MEDIUM | 900-1279 | Tree collapses to icons (click to expand); right pane reduces chat/terminal ratio |
| COMPACT | <900 | Single pane at a time, bottom tab switcher |

---

## 3. Key flows

### 3.1 First plug-in onboarding (5 min target)

Steps (detailed in arasul-plan.md §5.1), with UI elements:

1. **Welcome** (full-screen, 15s subtle animation) — tagline, "Continue" button.
2. **Name** (single field, "Enter your name" placeholder, Continue).
3. **Passphrase** (two password fields, zxcvbn meter, explanation copy: "This protects your AI credentials on the drive. You'll enter it each time you plug in. Write it down somewhere safe — if you lose it, your login is gone but your files are not.").
4. **Claude login** (large "Sign in with Anthropic" button, opens system browser OAuth; while waiting, subtle animation; on return, "You're logged in" check + Continue).
5. **Auto-launch opt-in** (toggle with OS-specific copy: "Open Arasul automatically when you plug this drive into this Mac/PC/computer?").
6. **Content import** (optional, skip for v1 beta).
7. → Dashboard.

### 3.2 Second plug-in (same computer, auto-launch installed)

1. Mount triggers launchd/Task/systemd → Arasul opens.
2. **Unlock screen** — large passphrase field, Forgot passphrase link (deletes vault, requires re-login), Unlock button.
3. → Dashboard.

Target time from plug-in to Dashboard: <10 seconds.

### 3.3 First plug-in to a *new* computer

Drive already onboarded, but computer is new:

1. User double-clicks the OS-appropriate launcher.
2. First security prompt (Gatekeeper / SmartScreen).
3. Unlock screen.
4. Post-unlock: small modal "Install auto-launch on this computer? [Install] [Not now]".
5. → Dashboard.

---

## 4. Components inventory

To be built in Phase 1-4. Prioritized.

### Phase 1 (skeleton)

- `App` — top-level routing between Unlock/Onboarding/Dashboard.
- `Unlock` — passphrase entry, error state.
- `ThreePaneShell` — resizable three-pane layout.
- `TreePane` — virtualized tree (react-arborist or handroll), filter-aware.
- `EditorPane` — CodeMirror 6 host, tab bar, read-only banner.
- `RightPane` — vertical split between `ChatPane` and `TerminalPane` (default collapsed).
- `TerminalPane` — xterm.js wrapper, PTY events bound.

### Phase 2

- `ProjectSwitcher` (⌘P palette).
- `CommandPalette` (⌘K).
- `TreePane` right-click menu.
- `NewProjectWizard` (wizard primitive).
- `BriefBar` (top, streaming).

### Phase 3

- `ChatPane` — message list, streaming renderer, markdown renderer, @-mention autocomplete.
- `ChatInput` — textarea with mention + slash command support.

### Phase 4

- `OnboardingWizard` — multi-step.
- `SettingsPanel` — tabs for general, security, updates, auto-launch, memory browser.
- `PassphraseSetup` — create/change with zxcvbn meter.
- `AutoLaunchInstaller` — OS-aware copy + install/uninstall button.

### Phase 5

- `UpdatePill` (top bar, when update available).
- `DriveDisconnectedModal`.

---

## 5. Copy & voice

### 5.1 Voice anchors (three words)

*Present. Calm. Capable.*

- **Present:** The app refers to you, not to "the user." Direct second-person.
- **Calm:** Errors explain, never blame. No alarming red unless data is at risk.
- **Capable:** We assume intelligence. No hand-holding copy, no excess emoji, no "wizards" in the Microsoft-2004 sense.

### 5.2 Copy examples

| Scenario | Bad copy | Good copy |
|---|---|---|
| Unlock | "Enter your password:" | "Welcome back. Unlock your drive." |
| Drive ejected | "ERROR: DRIVE DISCONNECTED" | "Your drive disconnected. Plug it back in when you're ready — your last edit is saved." |
| Passphrase too short | "Password must be at least 12 characters." | "A passphrase needs at least 12 characters — try a short sentence you'll remember." |
| First claude login | "Authenticate with Anthropic" | "Connect Claude. This opens your browser; you'll come back here." |
| No projects | (empty list) | "No projects yet. Press ⌘N to start one, or drag a folder from your computer." |

### 5.3 Error surfaces

Three tiers:

1. **Inline** — next to the input/action. Light grey text, no icon.
2. **Toast** — bottom-right slide-in for transient feedback ("Saved" / "Copied"). 2s auto-dismiss.
3. **Modal** — only for actions blocking further use (drive disconnected, vault unlock failure).

Never red unless destructive. Never ALL-CAPS. Never modal for mere validation.

---

## 6. Accessibility

- All interactive elements keyboard-reachable without a mouse.
- Minimum contrast ratio WCAG AA (4.5:1 body text, 3:1 large).
- System font size respected (users with 120%+ scaling not broken).
- All chat messages and editor content readable by screen reader.
- High-contrast mode detected and honored (`prefers-contrast`).

---

## 7. Open questions (decide by Phase 0 end)

- Monaco vs CodeMirror 6 for editor: leaning CodeMirror (smaller + better markdown). Confirm in Phase 1.
- React vs Svelte vs Solid for frontend: leaning React (widest ecosystem for xterm + CodeMirror). Confirm at Phase 0 end.
- Terminal default state: collapsed (current plan) vs always-visible-but-minimal. Decide in Phase 3 user-testing.
- Chat-vs-terminal as tabs vs split: current plan is split. May change if users always collapse one.
- Chat history persistence: ephemeral per session, or logged to `content/communication/chat-log/`? Lean logged for memory purposes.
