# Ultimate Polish Plan — myhub / Arasul

> **Status:** Master plan, supersedes `ux-overhaul-plan.md` and `v4-gui-plan.md` for everything visual + UX.
> **Date:** 2026-04-25
> **Author:** Synthesized from 15 parallel sub-agent audits across the entire codebase
> **Scope:** Boot experience (SSD plug-in), Python TUI startup, Tauri React app, landing site
> **Goal:** Take myhub from "feature-complete prototype" to "Cursor-meets-Claude-Code shippable product"

---

## 0. Vision

**The product feeling we are designing for, in one sentence:**

> Plug in the SSD → calm, fast, opinionated workspace materializes. Every surface uses the same restraint: monochrome canvas, single accent, system fonts, 120–200 ms motion, no chrome that doesn't earn its keep.

**Anchors:**
- **Claude Code (CLI):** dense, dark, fast, banner is small, type-and-go.
- **Cursor:** sidebar / editor / right-pane proportions, command palette as the spine, AI-first but never noisy.
- **Linear:** type system, motion ladder, focus rings, never a stray pixel.
- **Notion / Bear:** editor measure (~70ch), heading rhythm, slash commands.

**Anti-patterns we will not adopt:**
- ASCII-art bloat on startup
- Bouncy / spring animations on chrome
- Multi-color toolbars
- Modal stacks
- "Onboarding videos"
- Marketing copy inside the app

---

## 1. Hero Moment — The SSD-Mount First 5 Seconds

This is the only moment we cannot redo. It is the *trailer* of the product.

### 1.1 Storyboard (target)

| t | What the user sees | What is happening |
|----|----|----|
| 0 ms | SSD plugged in. Quiet. | launchd waits for mount. |
| 250 ms | A single Terminal window appears at a deterministic size (140 × 38). | Wrapper uses `open -a Terminal /Volumes/.../on-mount.command` (not osascript). |
| 400 ms | Subtle `connect.aiff` plays once. | `afplay` in background. |
| 500 ms | Native macOS notification: **"myhub connected"**. | `osascript -e 'display notification ...'`. |
| 800 ms | Terminal clears. A 4-line banner renders. (See §2.) | Python TUI imports. |
| 1.6 s | Greeting + status bar + project list rendered. Cursor on prompt. | Dashboard ready. |
| 5 s | User can type. | TUI fully interactive. |

### 1.2 Bugs to fix in the boot pipeline (from `.boot/` audit)

- **B1.** `~/.myhub-mount-wrapper.sh` is generated using `osascript … tell Terminal do script`, but the install.command comments themselves warn this causes the *zwei-Terminals* bug. Rewrite the wrapper to:
  ```sh
  exec /usr/bin/open -a Terminal "$DRIVE/.boot/on-mount.command"
  ```
  Reference: `install.command:57–66` is honest about the bug; `install.command` line ~80 must be changed to emit the corrected wrapper.
- **B2.** Preflight runs but its output is *visible to the user* before the TUI clears the screen — feels like a leaky abstraction. Either pipe preflight to a log file silently and only surface a single ✅ or ❌ line, or render the preflight checks *inside* the TUI's banner area as a one-line "✓ 11/11 checks" pill.
- **B3.** Failure UX is silent: failed mounts go to `/tmp/com.myhub.mount.err`, user sees nothing. Add a `display dialog` fallback inside `on-mount.sh` so a failed boot at least surfaces a banner: *"myhub didn't start cleanly — open Console.app or run `~/.myhub-diagnose`."*
- **B4.** Vault unlock is currently lazy (deferred to first vault-aware command). This is fine for performance but means the boot moment never *visibly* includes the security gesture. **Decision needed (see §17):** do we want the passphrase prompt up-front (more "secure-feeling") or keep lazy-unlock (faster)?
- **B5.** No Tauri app launch from boot. The Tauri app is a separate manual launch today. We must decide: does plugging the SSD in (a) only open the TUI, (b) only open Tauri, or (c) open the TUI which then offers `/dashboard` to launch Tauri? **Recommendation:** (c) — TUI is the always-on entry point; Tauri is the rich-edit mode the user opens explicitly. This matches the "claude code" mental model.

---

## 2. Python TUI — Claude-Code-Grade Startup Screen

The current TUI (`myhub-tui/`, prompt-toolkit + Rich) is *good* but **too ceremonial**. The 6-line ANSI-shadow logo with 240 ms-per-line animation is OpenAra DNA, not Claude Code DNA.

### 2.1 Current vs. target

**Current first-run render (~18 lines):**
```
─ status bar ─
[6-line ASCII logo, animated]
Guten Morgen, Kolja.
╭ System ──────────────╮
│ RAM ▰▰▰▱▱ …          │
│ Disk ▰▰…             │
╰──────────────────────╯
╭ Projects ────────────╮
│ [1] thesis           │
│ [2] project-x        │
╰──────────────────────╯
/ Kommandos · Tab vervollst. · ↵ ausführen · ^C beenden
  myhub ❯
```

**Target first-run render (~10 lines):**
```
 myhub  v0.1.0  py3.13  ~/myhub  3 projects
 ─────────────────────────────────────────────
 Good morning, Kolja.

 RAM  ▰▰▰▱▱  4.2 / 16 GB     Disk  ▰▰▰▰▰▰▱▱  224 / 500 GB

 1  thesis      ✓  edited 2h ago
 2  project-x   ·  edited yesterday
 3  ssd-tools   ·  edited last week

 / commands · tab complete · ^C exit
 myhub ❯ _
```

### 2.2 Concrete TUI changes

- **T1.** Delete the 6-line ANSI-shadow logo + animation entirely. Replace with a single wordmark line at the top of the status bar: `myhub  v0.1.0  py3.13  <path>  N projects`. (`dashboard.py:54–58, 249–250`.)
- **T2.** Render the *hint bar* once per session, not per prompt iteration. Currently `output.py:241` re-renders on every turn → vertical churn. Track in session state.
- **T3.** Compress `System` + `Projects` panels into two flat lines (no rounded boxes around them). Use `─` only as a single horizontal divider above the prompt. Boxes belong to first-time users, not power users.
- **T4.** Drop the time-aware German greeting in favor of a one-line status: `Good morning, <name>.` — short and respects the language preference. Make it skippable via `~/.myhub/quiet=true`.
- **T5.** Onboarding: fix the wizard re-render bug (`onboarding.py:44–50`) — empty-name re-prompt should call `refresh_full=True` so the screen doesn't stack.
- **T6.** Make tier breakpoints adaptive: at <80 cols don't render bars at all, just numbers.
- **T7.** Move project numbering to use **dot leaders** for alignment (`1  thesis ········· ✓ 2h`) instead of raw spaces — easier to scan visually.

### 2.3 Acceptance for §2

- First paint is ≤10 lines vertically.
- No animated logo, no ASCII art.
- Hint bar appears once, not after every command.
- Greeting fits on one line.
- Resume-from-`/claude` (refresh_full=False) renders just the divider + prompt — even tighter.

---

## 3. Foundation — Design Tokens & Primitives

This is **not optional**. Every other section depends on this layer being clean. Today the app has tokens (`theme.css`) but a *swarm* of hardcoded values bypasses them.

### 3.1 Token violations to eliminate

| Where | Violation | Fix |
|----|----|----|
| `MarkdownEditor.css:25,34–57,107` | Heading sizes hardcoded `15/32/24/19/13 px` | Add `--fs-h1..h4` semantic tokens, route through them |
| `MarkdownEditor.css:223–235` | Syntax highlighting palette hardcoded | Add `--hljs-keyword/string/comment/number` tokens |
| `Onboarding.css:1`, `RightPane.css:49`, `LeftPane.css:1`, `Unlock.css` | `#0E0F11` literal as accent-button text | Add `--text-on-accent` token |
| `RightPane.tsx:185–199`, `Terminal.tsx:47–59` | xterm theme inline | Build palette object from CSS vars at mount time, sync on theme change |
| `package.json` | `@codemirror/theme-one-dark` imported but unused | Either adopt it (override accent line + bg via theme tokens) or drop the dep |

### 3.2 New tokens to add to `theme.css`

```css
/* Semantic foreground */
--text-on-accent: var(--bg-canvas);

/* Editor */
--fs-h1: 32px;  --fs-h2: 24px;  --fs-h3: 19px;  --fs-h4: 16px;
--fs-editor-body: 15px;
--fs-editor-code: 13px;
--measure: 70ch;        /* max content width inside editor */
--editor-pad-y: 24px;   /* was 32/80 */
--editor-pad-y-bottom: 40px;

/* Syntax */
--hljs-keyword: #c678dd;
--hljs-string:  #98c379;
--hljs-comment: #5c6370;
--hljs-number:  #d19a66;
--hljs-fn:      #61afef;

/* Easing */
--ease-out: cubic-bezier(0.22, 1, 0.36, 1);
--dur-fast: 120ms;
--dur-base: 160ms;
--dur-slow: 240ms;
```

### 3.3 Light mode (decision: yes, ship it)

The Tauri config has no light-mode variant; theme.css is dark-only. Add:
- `:root[data-theme="light"]` token overrides
- Settings toggle: System / Dark / Light
- Persist preference; default to *system*
- xterm + CodeMirror palettes both must read tokens, not literal colors

### 3.4 Acceptance for §3

- No `#hex` literals in any `*.css` outside `theme.css`.
- No inline `style={{ background: "#…" }}` for theming purposes anywhere in `src/`.
- Toggling `data-theme="light"` on `<html>` re-skins editor, terminal, tree, palette, statusbar without code change.
- Heading scale, editor padding, mono font, accent — all reachable via one variable each.

---

## 4. App Shell — Window Chrome & Layout

The Tauri config has been left at defaults. This is the single biggest first-impression delta vs. Cursor / Linear.

### 4.1 `tauri.conf.json` changes

```jsonc
{
  "windows": [{
    "decorations": true,
    "titleBarStyle": "Overlay",        // was "Visible"
    "hiddenTitle": true,                // hide "Arasul" text label
    "transparent": false,
    "windowEffects": {                  // macOS vibrancy
      "effects": ["sidebar"],
      "state": "active"
    },
    "minWidth": 880,
    "minHeight": 540,
    "width": 1280,
    "height": 800
  }],
  "app": {
    "security": {
      "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ipc: https://api.github.com;"
    }
  }
}
```

### 4.2 Cargo / Rust additions

- Add `tauri-plugin-window-state` → window geometry persists across launches.
- Add `tauri-plugin-single-instance` → second launch focuses the existing window instead of opening a duplicate (vault.enc collisions become impossible).
- Add a minimal native menu in `lib.rs` setup: **File** (New, Open, Close), **Edit** (Undo, Redo, Cut, Copy, Paste, Find), **View** (Toggle Sidebar, Toggle Terminal, Toggle Theme), **Window** (Minimize, Zoom), **Help** (Shortcuts ⌘/, About).
- DevTools: explicit `devtools = false` in release config.

### 4.3 Layout polish

- Replace inline `.hidden` class toggling in `ThreePaneShell.tsx:86–88` with a CSS-only `data-tab="…"` selector → no React re-renders on tab switch.
- Pin the three-pane proportions to mockup spec: left 240 px (range 200–320), right 380 px (range 320–480), editor flex.
- Add a `usePersistedPaneSizes` hook to remember user resize across sessions.

### 4.4 Acceptance for §4

- Traffic lights overlay on a vibrancy sidebar; no "Arasul" word in the chrome.
- Closing and reopening the app restores window position and pane sizes.
- Cmd+N opens a new file, Cmd+, opens settings, Cmd+/ opens shortcut cheatsheet — all from native menu and palette.
- CSP audit passes; no inline scripts.

---

## 5. Markdown Editor — Professional-Grade Polish

> **The user explicitly named this:** "der Markdown-Editor hat oben und unten so komische Ränder und sieht nicht professionell aus." This is the single most-felt visual issue.

### 5.1 The padding fix (literal change)

**File:** `arasul-app/src/components/MarkdownEditor.css:12`

```diff
- .arasul-md-editor { padding: 32px 0 80px; }
+ .arasul-md-editor { padding: var(--editor-pad-y) 0 var(--editor-pad-y-bottom); }
```

With `--editor-pad-y: 24px; --editor-pad-y-bottom: 40px;`. This kills the "weird borders" the user is feeling. The 80 px bottom was scroll-past space — but at 80 px it makes the document feel detached. 40 px is the Notion / Bear standard.

Also constrain the body width:
```css
.arasul-md-canvas .tiptap {
  max-width: var(--measure);   /* 70ch ≈ 760px at 15px sans */
  margin: 0 auto;
  padding: 0 var(--sp-3);
}
```

### 5.2 Toolbar — the missing professional UX

The editor has zero visible formatting controls. Every TipTap extension is wired but invisible. The user must know markdown syntax. This is the #1 reason it does not feel professional.

**Decision:** ship **two complementary surfaces**:

1. **Bubble menu** on text selection (Notion-style): bold / italic / underline / strike / inline-code / link / heading-cycle. Floats above selection, fades in 120 ms.
2. **Slash command menu** (Notion / Linear style) triggered by `/`: heading 1–4, bullet list, ordered list, task list, quote, code block, table, divider, image, callout. Powered by `cmdk` (already in deps).

No top toolbar. Two surfaces, both keyboard-summonable, both invisible until invoked.

### 5.3 Missing extensions to add

- **Underline** (`@tiptap/extension-underline`) — Cmd+U is universally expected.
- **Math** (`@tiptap/extension-mathematics` + KaTeX) — gated behind `/math` slash command.
- **Callout** (custom blockquote variant) — `> [!NOTE]` / `[!WARNING]` / `[!TIP]` rendered as colored sidebars.
- **Image paste from clipboard** — wire `editor.view.props.handlePaste` to read `ClipboardEvent.clipboardData.items`, save as `attachments/<uuid>.<ext>` inside the project, insert as `![](attachments/...)`.
- **Drop image to insert** — same handler on `handleDrop`.
- **Re-enable H5/H6** — current StarterKit is configured `levels: [1,2,3,4]`; bump to `[1,2,3,4,5,6]`. The user said *"alle Formatierungssachen drin"*.

### 5.4 Document chrome additions

- **Word + character count** in the bottom-right of the editor pane (live-updating, debounced 200 ms).
- **Last-saved timestamp** next to the save dot, e.g. `saved · 2 min ago`.
- **Focus mode** (toggle Cmd+. ): hide tree + right-pane, expand editor to 100%, fade chrome to 30 %.
- **Markdown source toggle** (Cmd+Shift+M): swap to a CodeMirror with `lang-markdown` for raw `.md` editing. Round-trips losslessly.

### 5.5 Typography in editor

Already good (760 px max-width, 15 px body, 1.7 line-height, semibold H1). Lock these in tokens (§3) so they can't drift.

### 5.6 Acceptance for §5

- New empty `.md` looks identical in spacing to a fresh Notion / Bear / Obsidian doc — no perceived "weird borders" top or bottom.
- Selecting text shows bubble menu in <120 ms.
- Typing `/` at line start shows slash menu within one frame, fuzzy-searchable.
- Pasting an image from clipboard inserts it inline within 200 ms.
- Cmd+Shift+M swaps to source mode without losing cursor position.

---

## 6. Code Editor (CodeMirror) Polish

`EditorPane.tsx` is the non-markdown path. It's underconfigured.

- **L1.** Activate `oneDark` from `@codemirror/theme-one-dark` (currently a dead dep). Override only the accent line and background to match app palette.
- **L2.** Turn on: `lineNumbers: true`, `highlightActiveLine: true`, `foldGutter: true`, `bracketMatching()`, `searchKeymap` + `search()` extension for Cmd+F.
- **L3.** Set explicit `indentUnit: "  "` (2 spaces) and add `indentWithTab` keybinding.
- **L4.** Preserve scroll position on save: capture `editorView.scrollDOM.scrollTop` before write, restore via ref.
- **L5.** Add **breadcrumbs** in editor tab bar showing `project / folder / file.ext`.
- **L6.** Defer to phase 2: minimap, sticky scroll, inline AI suggestions.

---

## 7. Terminal Pane Polish

xterm.js is wired but the polish gap is large.

- **X1.** Theme-tokenized palette (§3): build the palette object from `getComputedStyle(document.documentElement)` reading `--bg-canvas`, `--text-primary`, `--accent`, etc. Re-build on theme change event.
- **X2.** Eliminate Terminal.tsx vs. RightPane.tsx duplication by extracting `useXTerm({ palette, fontFamily, fontSize, padding })` hook.
- **X3.** Add `@xterm/addon-search`. Bind Cmd+F inside the focused terminal pane → in-pane search overlay.
- **X4.** Add `@xterm/addon-web-links` for clickable URLs.
- **X5.** Add 8 px symmetric padding to the xterm container (was 0–6 px asymmetric). Content should never touch the pane edge.
- **X6.** Style the xterm scrollbar to match app: `.xterm-screen { scrollbar-color: var(--border-subtle) transparent; scrollbar-width: thin; }`.
- **X7.** Differentiate focused vs. blurred terminal: focused = cursor full opacity + accent color; blurred = cursor 40 % opacity + secondary text color. Adds spatial awareness in multi-pane layout.
- **X8.** Generic `Terminal.tsx` should reuse the visibility-aware fit logic that only `RightPane.tsx` currently has (ResizeObserver + 30 ms post-tab-switch refit).

---

## 8. File Tree & Project Nav

`TreePane.tsx` is the most under-built primitive vs. Cursor / VS Code.

- **F1.** **Virtualize** with `react-arborist` (the comment in the file already names this as Phase 2 — promote to Phase 1). Required for any project >2k files.
- **F2.** **Keyboard navigation** — currently zero. Implement: ↑/↓ select prev/next visible row; ←/→ collapse/expand or jump to parent; Enter to open; Space to toggle expand; type-ahead jumps to first match.
- **F3.** **Focus ring** on the active row (currently no visual indication of keyboard focus).
- **F4.** **File-type icon mapping** (lucide-react has good basics): `.ts/.tsx` → `FileCode`, `.md` → `FileText`, `.json` → `Braces`, `.png/.jpg/.svg` → `Image`, `.mp3/.wav` → `Music`, `.mp4/.mov` → `Film`, default → `File`. Color-tinting optional, kept subtle (15 % alpha of accent for code, neutral otherwise).
- **F5.** **`.gitignore` awareness** — read `.gitignore` per-project, hide `node_modules`, `.git`, `target`, `dist` by default. Add a "Show hidden" toggle in the tree header.
- **F6.** **Reveal-in-tree** action when opening from palette / search.
- **F7.** **Inline rename** via F2 (currently context-menu only).
- **F8.** **Loading state** — small spinner in the row when expanding a slow folder.
- **F9.** **Section labels** ("CONTENT", "MEMORY") at the top of the tree, per mockup.
- **F10.** **Selected-row indicator** — left-edge 3 px accent inset shadow (per mockup spec, currently background-only).

---

## 9. Command Palette

`cmdk` is wired but missing 5 features that make it feel like Cursor / Raycast.

- **P1.** **Fuzzy-match highlighting** — wrap matched chars in `<mark>` styled with accent.
- **P2.** **Virtual scroll** for files list (currently silently capped at 200, then renders all 200 at once).
- **P3.** **"+ N more — press Tab for all"** footer when results are truncated, instead of silent slicing.
- **P4.** **Recent files** section above the file list.
- **P5.** **Cmd+Enter** = open in horizontal split. Detect modifier in `onSelect` callback.
- **P6.** **Aria-label on input** + `role="combobox"` for screen readers.
- **P7.** **Two `Cmd+P` listeners** (App.tsx:65 and CommandPalette.tsx:44) → consolidate to one source of truth in App.tsx; CommandPalette only handles in-palette mode switching.
- **P8.** Symbol search: `@symbol` prefix to search across files.

---

## 10. Screens — Onboarding, Unlock, Settings

### 10.1 Localization bug (P0 — credibility killer)

`Settings.tsx:206, 221, 283` contain German strings in an otherwise English UI:

- `"Verbunden als ${acct.login}"` → `"Connected as ${acct.login}"`
- `"GitHub-Verbindung gelöscht."` → `"GitHub connection removed."`
- `"Prüfe…"` → `"Checking…"`

(Or, alternatively: ship a real i18n layer with `de`/`en` resource bundles and a Settings → Language toggle. Memory says you're German-native so a proper de bundle is *welcome*, but **the mixed state is the real bug**.)

### 10.2 Onboarding

- **O1.** Step transitions: 160 ms cross-fade with a subtle 8 px translateX (next step right, prev step left). Uses `transform`/`opacity` only.
- **O2.** ESC handling: confirm-dialog "Discard setup?" instead of locking the user in.
- **O3.** Strength bar: switch from `width` animation (layout-triggering) to `transform: scaleX(...)` with `transform-origin: left`. Same visual, GPU-accelerated.
- **O4.** Reorder copy: name first (warmest), passphrase second, auto-launch last (lowest commitment / opt-in).
- **O5.** Add a "skip for now" link on the auto-launch step (the user can still enable it from Settings → Auto-launch).

### 10.3 Unlock

- Already the tightest screen. Two micro-additions:
- **U1.** Add a "Forgot passphrase? → recovery options" subtle link → opens a help overlay (not a modal) explaining there is no recovery and pointing to the recovery-keys flow if implemented.
- **U2.** Animate failed-attempt feedback: 2 px horizontal shake (4 frames at 60 fps, `transform` only).

### 10.4 Settings

- **S1.** ESC closes the modal.
- **S2.** Enter inside passphrase fields submits the change.
- **S3.** Tab transitions: 120 ms opacity cross-fade (currently instant).
- **S4.** Memory + Health sections: skeleton placeholders during fetch (currently jump-in).
- **S5.** Add a "Shortcuts" tab listing every keybind (single source of truth, also shown by Cmd+/).
- **S6.** Add a "Theme" row: System / Dark / Light radio.

---

## 11. Motion System

Today: tokens exist (`--motion-fast/--motion/--motion-slow`) and `prefers-reduced-motion` is respected. But many surfaces hard-cut, and one surface is layout-triggering.

- **M1.** Add explicit easing tokens (§3.2): `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)`. Replace bare `ease` usages.
- **M2.** Onboarding strength bar: `transform: scaleX()` not `width:` (perf).
- **M3.** Add cross-fade on screen transitions (checking → onboarding → unlock → main shell). 200 ms opacity with 8 px translateY.
- **M4.** Tab switches in editor pane + right pane: 120 ms cross-fade (overlay during `display:none` swap to avoid reflow).
- **M5.** Tree folder expand/collapse: 120 ms max-height transition on the children container.
- **M6.** Save toast: already has `toast-in`; add `toast-out` mirror (translateY +8 px + opacity 0).
- **M7.** Search results: 80 ms staggered fade-in per row (max 6 rows animated, the rest instant).
- **M8.** Modal overlays: fade backdrop opacity 0→1 over 160 ms, content scale-in 0.98→1 over 160 ms.

---

## 12. Accessibility & Keyboard Nav

The audit found 10 violations, all fixable in a single 1-day pass.

- **A1.** Every icon-only button gets `aria-label` (terminal close, modal close, search clear, …).
- **A2.** Every `<input>` gets a real `<label htmlFor>` association.
- **A3.** Every modal: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, focus-trap inside, ESC closes, focus restored on close.
- **A4.** Replace `<span role="button">` (RightPane.tsx:120) with real `<button>`.
- **A5.** Tree gets full keyboard navigation (§8.F2).
- **A6.** Cmd+/ opens a global "Shortcuts" cheatsheet overlay — discoverability problem solved in one go.
- **A7.** Add `<main>`, `<nav>`, `<aside>` landmarks to the three-pane shell.
- **A8.** Tighten `--text-tertiary` contrast: today `#636976` on `#0E0F11` is ~6:1 — fine for body, but anywhere it's used at `<14 px` we should bump to 5:1+. Audit at small sizes.
- **A9.** Add visible focus rings to `.arasul-tree-row`, `.arasul-term-tab`, palette items, file-tree icons.
- **A10.** First-tab from app load lands on a meaningful element (not random body).

---

## 13. Security & Tauri Hardening

Beyond §4, the audit surfaced specific risks:

- **SEC1.** **Re-enable CSP** (already in §4.1). The current `csp: null` means any frontend XSS = full Tauri command access = vault exfiltration.
- **SEC2.** **Sanitize `dangerouslySetInnerHTML`** in `ChatPane.tsx:140` and `EditorPane.tsx:685`. We already depend on `dompurify` — wrap every `marked.parse(...)` output through `DOMPurify.sanitize(...)`.
- **SEC3.** **Subprocess allowlist** — `lib.rs` spawns `claude`, `arasul-cli`, `launchctl` directly. Wrap them in a single helper that whitelists by absolute path under `bin/` or `runtime/` and rejects everything else.
- **SEC4.** **Vault crypto is excellent** (Argon2id OWASP 2025 + XChaCha20Poly1305). Leave it alone. Add zeroize-on-drop assertion test.
- **SEC5.** Don't ship the wrapper script writing `osascript` plaintext into `$HOME/` — use `tauri-plugin-fs` scoped writes only.

---

## 14. Landing Site & Brand Alignment

`landing/` exists but drifts from the app brand:

- **LP1.** **Token unification** — rename `--bg`, `--text` to match app's `--bg-canvas`, `--text-primary`. Same hex values, one source of truth (consider symlinking a generated `tokens.css` from `arasul-app/src/theme.css`).
- **LP2.** **og:image** + open-graph + twitter-card meta on every page. 1200×630 `arasul-og.png` (wordmark on dark).
- **LP3.** **Favicon** + `apple-touch-icon` (currently missing on all 5 pages).
- **LP4.** **`@font-face` + preload** for Geist (currently relies on system install).
- **LP5.** **Signup form**: client-side validation with inline errors; success toast after `mailto:` handler (not silent).
- **LP6.** **Meta descriptions** on signup, support, privacy pages (currently only index has one).
- **LP7.** **Consistent typography ramp** — landing's `clamp(40px, 6vw, 72px)` H1 is fine, but the rest of the site should lock to the app's `--fs-*` tokens.

---

## 15. Sequencing

Five phases over ~5 weeks of focused work. Each phase ships independently and visibly.

### **Phase A — Foundation (1 week, P0)**
The pre-requisite for everything else.

- §3 Tokens & primitives (kill all hardcoded colors / fonts / paddings)
- §10.1 German-string fixes in Settings
- §13 CSP re-enabled, dompurify sanitization
- §5.1 Markdown editor padding fix (the user's named complaint)
- §4 Window state plugin + single-instance plugin + native menu
- **Acceptance:** No `#hex` outside `theme.css`. App opens at last position. Cmd+, / Cmd+/ work from menu.

### **Phase B — Hero Moment (1 week, P0)**
Redo the first 5 seconds of the product.

- §1.2 Boot wrapper bugfix (no more zwei-Terminals)
- §1.2 Preflight surfaced as one-line pill
- §2 TUI startup screen redesign (no more 6-line logo)
- §1.2 B5 decision: TUI-first, Tauri opens via explicit command
- **Acceptance:** Plug-in → 5 s storyboard matches §1.1 exactly. TUI fits in ≤10 lines.

### **Phase C — Editor Polish (1 week, P0)**
The user's primary complaint zone.

- §5 Markdown editor: bubble menu, slash menu, underline, callouts, math, paste-image, source toggle, focus mode, word count
- §6 CodeMirror: oneDark, line numbers, search, fold gutter, scroll preserve, breadcrumbs
- **Acceptance:** New `.md` file feels like Bear/Notion; Cmd+Shift+M toggles source; paste a screenshot → image embeds.

### **Phase D — Surrounding Polish (1 week, P1)**
Tree, terminal, palette, screens, motion.

- §7 Terminal: search addon, theme tokens, padding, scrollbar
- §8 Tree: virtualization, keyboard nav, file-type icons, .gitignore, section labels
- §9 Palette: fuzzy highlight, virtual scroll, recent files, Cmd+Enter split
- §10.2/.3/.4 Screen polish (ESC, Enter, transitions)
- §11 Motion ladder + §3.3 Light mode
- §12 A11y pass
- **Acceptance:** Full keyboard-only run-through of the app: open project → navigate tree → open file → edit → save → run terminal command → close — no mouse.

### **Phase E — Outside the App (3–5 days, P1)**
The brand surfaces around the product.

- §14 Landing site fixes
- §13 Subprocess allowlist + zeroize tests
- §10.4 S5 Shortcuts cheatsheet (Cmd+/)
- Visual regression screenshots captured for all panes (manual baseline)
- **Acceptance:** Stranger lands on landing page → trusts the product → signs up → installs → plug-in → first 5 s exactly as designed → opens markdown file → feels Notion-grade.

---

## 16. Acceptance Criteria — Top-Level

The product ships when *all* of these pass:

1. **Boot:** plug SSD → Terminal opens once, never twice; banner ≤10 lines; user types within 2 s of mount completion.
2. **Theme:** flip light/dark via Settings → editor, terminal, tree, palette, statusbar all re-skin instantly.
3. **Markdown editor:** open new `.md` → top/bottom whitespace looks like Bear or Notion. Bubble menu on selection. Slash menu on `/`. Cmd+Shift+M source toggle.
4. **Code editor:** line numbers, fold gutter, Cmd+F search, ones-dark theme, no dead deps.
5. **Tree:** 5000-file project loads in <500 ms, scrolls smoothly, keyboard-only navigable.
6. **Terminal:** Cmd+F searches in pane; theme matches app; padding consistent.
7. **Palette:** Cmd+P fuzzy-highlights matches; Cmd+Enter splits; "N more" footer; recent files section.
8. **A11y:** screen reader walks the entire app; every modal traps focus; every icon-only button announces a label.
9. **Security:** CSP enforced; no inline scripts; vault test suite green; subprocess allowlist enforced.
10. **Landing:** og:image renders on Twitter / iMessage preview; favicon present; signup gives feedback.

---

## 17. Decisions (locked 2026-04-25)

Captured via interview after Phase A landed. These shape Phase B and beyond.

1. **SSD-mount auto-start: Tauri-only.** On plug-in, the Tauri app opens directly. The Terminal/TUI does **not** auto-launch. The myhub-tui still works as the right-pane content inside the app, but is no longer the hero surface. → §1, §2 are revised below.
2. **Vault unlock: at mount, up-front.** The Unlock screen is the first interactive paint after the splash. No lazy-unlock pill. The existing `screens/Unlock.tsx` flow stays as-is.
3. **Markdown editor controls: all three surfaces.** Fixed top toolbar + bubble-on-selection + slash-on-`/`. Phase C ships every formatting feature reachable via every input style.
4. **Language: English-only.** No i18n infrastructure, no de bundle. Phase A's German-string fixes are final.

Still open (not blocking Phase B): light-mode timing, markdown source-toggle style (swap vs. split), update pill timing.

---

## 1bis. Hero Moment (revised after decisions)

The boot pipeline now targets the Tauri `.app` bundle, not Terminal.

### 1bis.1 Storyboard (target)

| t | What the user sees | What is happening |
|----|----|----|
| 0 ms | SSD plugged in. Quiet. | launchd waits for mount. |
| 250 ms | macOS bounces the Tauri app icon in the Dock. | `~/.myhub-mount-wrapper.sh` calls `open -a "Arasul.app"` (or `open -b de.unit-ix.arasul`). |
| 400 ms | Subtle `connect.aiff` plays once. | `afplay` in background. |
| 500 ms | macOS notification: **"myhub connected"**. | Same as before. |
| 700 ms | Tauri window paints with vibrancy sidebar visible. **Splash** (small wordmark) center-screen on the canvas. | React mounts; vault state being checked. |
| 1.0 s | Splash dissolves into Unlock screen (vibrancy still visible behind). | `screens/Unlock.tsx` renders. |
| → user | User types passphrase. Failed = 2px shake; success = 200 ms cross-fade into main shell. | Vault unlocks. |
| 5 s post-unlock | Three-pane shell visible, last project + last file restored. | Workspace state rehydrated. |

### 1bis.2 Boot pipeline rewrite

- `.boot/install.command` line ~80: emit a wrapper that does `exec /usr/bin/open -a "Arasul"` (or by bundle id), not the osascript Terminal-do-script. The "zwei Terminals" bug becomes irrelevant — no Terminal involved anymore.
- `.boot/on-mount.command` keeps preflight, sound, notification — drops the `clear && exec launcher.sh` tail.
- The `bin/arasul-tui-pane` script is still invoked by `RightPane.tsx` when the user opens a terminal pane inside the app. That code path is unchanged.

### 1bis.3 What changes for §2 (TUI startup)

The TUI is no longer the hero surface, so the §2 redesign de-prioritizes:
- **Keep:** the bug fixes (refresh_full on empty-name in `onboarding.py`, hint-bar-once-per-session in `output.py`).
- **Defer:** the visual ceremony reduction (logo bloat, panel borders, greeting). Still good to do, but not Phase B-critical. Move to Phase D backlog.

### 1bis.4 Splash screen (new)

A 300–700 ms intermediate paint between window-create and Unlock-screen-mount, so the user never sees an empty white window or a flash of unstyled content. Implementation: `App.tsx` already renders an `<div className="arasul-splash">Arasul</div>` during `checking` state — keep that, lock its background to `var(--bg-canvas)`, fade-out via opacity transition when state moves to `absent`/`locked`.

---

## 5bis. Markdown editor — three surfaces (revised)

Per decision #3, ship all three:

- **Top toolbar** (sticky, ~36 px tall, inside the editor pane, max-width matches `--measure`):
  - Bold · Italic · Underline · Strike
  - Heading dropdown (Body / H1 / H2 / H3 / H4)
  - Bullet List · Ordered List · Task List
  - Quote · Code (inline) · Code Block · Link · Image · Table · HR
  - Compact-mode toggle (right edge) → hides the toolbar

- **Bubble menu** (on text selection only): Bold · Italic · Underline · Strike · inline-Code · Link · Heading-cycle. Floats above selection, fades 120 ms.

- **Slash menu** (on `/` at line-start): all block-level inserts. Powered by `cmdk`. Fuzzy-searchable.

Spacing budget: top toolbar eats ~36 px → editor visible area shrinks. Compensated by reducing top padding (already done in Phase A) and offering compact-mode toggle for focus sessions.

---

## 18. Out-of-Scope (explicit non-goals for this plan)

- **Inline AI suggestions** in the code editor (Cursor's Tab-to-accept). Phase F+, requires server-side infra.
- **Collaboration** (multi-cursor across devices). Out of scope for SSD-portable architecture.
- **Plugin system** for third-party extensions. Phase F+.
- **Mobile companion**. Different product.
- **Cloud sync**. Antithetical to "your data on a drive you carry."

---

## 19. Reference — Files Touched (provisional)

Phase A heavy hitters:
- `arasul-app/src/theme.css` — token expansion
- `arasul-app/src/components/MarkdownEditor.css` — padding + headings via tokens
- `arasul-app/src/components/MarkdownEditor.tsx` — bubble menu, slash menu wiring
- `arasul-app/src/components/Settings.tsx` — strings 206/221/283
- `arasul-app/src-tauri/tauri.conf.json` — chrome + CSP
- `arasul-app/src-tauri/Cargo.toml` — window-state + single-instance plugins
- `arasul-app/src-tauri/src/lib.rs` — native menu
- `.boot/install.command` — wrapper rewrite (open -a Terminal)
- `myhub-tui/myhub_tui/dashboard.py` — banner overhaul
- `myhub-tui/myhub_tui/output.py` — once-per-session hint
- `myhub-tui/myhub_tui/onboarding.py` — refresh_full bug

---

*This plan is opinionated. Where this plan disagrees with `arasul-design-spec.md` or `v4-gui-plan.md`, this plan wins.*
