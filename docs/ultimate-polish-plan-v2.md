# Arasul · Ultimate Polish Plan v2

> Synthesis of a 15-agent deep audit (project create, git clone, hotkeys, editor focus, settings, top-bar, github, onboarding, tree, command palette, right-pane, web research, theme, error/toast, status bar, a11y) commissioned 2026-04-26.
> Goal: bring Arasul to Cursor-quality polish for **non-technical users** who want to "create artifacts with AI."
> Audience: Kolja + future contributors. Each item has file:line evidence and concrete fix instructions.

---

## 0. Executive summary

The app is **engineered well** (vault crypto, IPC, streaming, atomic writes) but has **shallow surface polish** in three high-impact areas:

1. **Silent failure modes** — 14+ `.catch(() => {})` swallow errors. File-save failures are invisible → real data-loss risk.
2. **False feature advertising** — ShortcutsOverlay/StatusBar promise things that aren't wired (⌘B/I/U, ⌘F outside terminal, ⌘L lock, "Claude" tab that's actually a shell).
3. **Hardcoded developer-machine path** (`App.tsx:168`) — when the SSD is plugged into a fresh Mac, the app reads from a non-existent directory and looks broken.

There are 7 P0 (broken / data-loss risk), 12 P1 (missing core UX), and ~25 P2 (polish/consistency) items. Total estimated effort: **~5-6 focused days** to ship through Phase 4. Phases 5+ are stretch.

---

## 1. P0 · Critical fixes (1-2 days)

These break the user's first 5 minutes or risk data loss. Fix before anything else.

### 1.1 Auto-detect drive root
**File:** `src/App.tsx:167-169`
**Current:**
```ts
return (import.meta.env.VITE_ARASUL_ROOT as string | undefined)
  ?? "/Users/koljaschope/Documents/ssd";
```
**Fix:** add a Tauri command `detect_drive_root` that probes:
1. `/Volumes/myhub/.boot` (macOS, the actual SSD)
2. `/Volumes/*/.boot` (any mounted volume with `.boot/`)
3. `$VITE_ARASUL_ROOT` (dev override)
4. Repo fallback (only if `cargo` env is `dev`)

Frontend awaits this in `SessionProvider` before rendering Onboarding. Without it, the polished app shows wrong files on the actual product hardware.

### 1.2 Remove blue focus border on editor
**File:** `src/theme.css:101, 200-207` (cascades to TipTap)
**Cause:** global `[tabindex]:focus-visible { box-shadow: var(--focus-ring) }` reaches the contenteditable via the ProseMirror wrapper.
**Fix:** add to `src/components/MarkdownEditor.css` after line 34:
```css
.arasul-md-canvas .tiptap:focus,
.arasul-md-canvas .tiptap:focus-visible {
  outline: 0 !important;
  box-shadow: none !important;
}
```
Rationale: iA Writer / Bear / Obsidian all use no border on prose surface — caret + selection are sufficient focus signal.

### 1.3 Stop swallowing `write_file` errors
**Files:** `src/components/EditorPane.tsx:429`, `src/components/MarkdownEditor.tsx:259`, plus 12 other locations (see §5.2)
**Fix:** install Sonner (`pnpm add sonner`), mount `<Toaster />` in `App.tsx`, replace every silent catch with a typed toast:
```ts
.catch((e) => toast.error("Couldn't save", { description: errorMessage(e), action: { label: "Copy", onClick: () => copy(String(e)) } }))
```

### 1.4 Mount ChatPane or fix the lie
**Files:** `src/components/ThreePaneShell.tsx:79-108`, `src/components/ChatPane.tsx`
**Bug:** `CompactShell` labels the right pane "Claude" but renders `<RightPane />` (a terminal). `<ChatPane />` is implemented but never imported. This is misleading.
**Fix (recommended):** make `<RightPane />` host two tabs — "Terminal" and "Chat" — both always available; default to Terminal. Remove the misleading "Claude" label.

### 1.5 `/new <title>` slash command stub
**File:** `src/components/ChatPane.tsx:48-73` (the entire `useEffect` for slash routing)
**Current:** `/new` returns a stub message ("would fire (Phase 2.7)").
**Fix:** wire it to dispatch a `workspace.openNewProjectModal()` event the LeftPane listens for. Or simpler: treat the chat as an event bus; LeftPane subscribes.

### 1.6 Wire missing keyboard shortcuts
**File:** `src/components/MarkdownEditor.tsx` near the existing ⌘S handler
| Shortcut | Action | Status |
|---|---|---|
| ⌘B | toggle bold | NOT wired (claimed) |
| ⌘I | toggle italic | NOT wired (claimed) |
| ⌘U | toggle underline | NOT wired (claimed) |
| ⌘F | editor in-file find | only terminal-scoped (claimed global) |
| ⌘L | lock vault | "(coming)" — wire it |

TipTap exposes `editor.commands.toggleBold()` etc. — five lines of code each. ⌘F in TipTap needs a custom search overlay (or wire the existing CodeMirror SearchPanel only when in source mode and add a TipTap `find-and-replace` extension for WYSIWYG).

### 1.7 Auto-generate `.gitignore` on project create
**File:** `src-tauri/src/projects.rs:89` (`create_project`)
**Risk:** without it, `.boot/vault.enc` could be committed to a public GitHub repo. Real catastrophic outcome.
**Fix:** add a `github_generate_gitignore` Tauri command that writes a project-local `.gitignore` (default template: `.boot/`, `vault.enc`, `runtime/`, `node_modules/`, `.env`, `target/`, `__pycache__/`). Call it as part of `create_project` whenever `init_git=true`.

---

## 2. P0 · TopBar commit/push (user explicitly asked) (½ day)

The user's main request: top-right buttons to commit and push the active project's auto-created GitHub repo.

### 2.1 New backend command: `github_commit` (separate from push)
**File:** `src-tauri/src/github.rs` (new function)
Currently `github_push` does `git add -A && git commit && git push` in one shot. We need a standalone commit so the user can save locally without the network risk.

```rust
#[tauri::command]
pub fn github_commit(args: CommitArgs) -> Result<CommitResult> {
    // git add -A
    // git commit -m "<message>"  (skip if nothing to commit unless allow_empty)
    // return { hash, files_changed }
}
```

### 2.2 New frontend hook: `useGithubStatus`
**New file:** `src/hooks/useGithubStatus.ts`
Polls `github_project_status` every 8s (or on-demand after a commit/push). Returns `{ branch, dirty, ahead, behind, hasRemote, hasToken, isRepo }`.

### 2.3 TopBar layout
**File:** `src/components/TopBar.tsx` + `TopBar.css`
```
┌──────────────────────────────────────────────────────────┐
│ Arasul │ project · file.md │ [● 3 changes][main ↑2][Commit][Push] │
└──────────────────────────────────────────────────────────┘
```
- Status pill: clickable; opens a "Changes" popover listing files (use `git status --porcelain`).
- Commit button: opens a small popover (not a heavy modal): textarea, smart default ("Update from Arasul"), [Commit] | [Commit & Push].
- Push button: direct invoke; on success show toast "Pushed 2 commits to main."
- Hide all controls when no active project, or `is_repo=false`, or `has_remote=false` (with a tooltip linking to "Create GitHub repo").

### 2.4 New component: `<CommitPopover />`
**New files:** `src/components/CommitPopover.tsx` + `.css`
Reuse the modal-styling patterns from Settings, but as a popover anchored to the Commit button (not full-screen). Linear-style: optimistic action + 5s undo toast (we already pushed, the toast offers `git revert HEAD --no-edit` as undo within a window).

### 2.5 Files to create / modify
| File | Action | LOC |
|---|---|---|
| `src-tauri/src/github.rs` | + `github_commit`, register | ~60 |
| `src-tauri/src/lib.rs` | register new command | 1 |
| `src/components/TopBar.tsx` | add right controls | ~80 |
| `src/components/TopBar.css` | new pill / button styles | ~50 |
| `src/components/CommitPopover.tsx` | new | ~120 |
| `src/components/CommitPopover.css` | new | ~60 |
| `src/hooks/useGithubStatus.ts` | new | ~40 |

---

## 3. P0 · Project create polish + dotfolder fix (½ day)

### 3.1 Project-create modal spacing
**File:** `src/components/LeftPane.tsx:357-413`, `LeftPane.css:170-220`
**Issues:**
- Inputs lack padding (`.arasul-modal-body input` only has `font-size` + `width`)
- No visible border on inputs
- Error message has no top margin
- Hardcoded `gap: 8px` instead of `var(--sp-2)`
- "New project" capitalization inconsistent with "Create vault" pattern
- Hardcoded German checkbox text

**Fix patch (`LeftPane.css:181`):**
```css
.arasul-modal-body input,
.arasul-modal-body textarea {
  width: 100%;
  padding: var(--sp-3) var(--sp-4);
  font-size: var(--fs-md);
  border: var(--border);
  border-radius: var(--radius);
  background: var(--bg-elevated);
  color: var(--text-primary);
}
.arasul-modal-body input::placeholder,
.arasul-modal-body textarea::placeholder { color: var(--text-tertiary); }
.arasul-modal-body .arasul-error { margin-top: var(--sp-2); }
.arasul-modal-actions { margin-top: var(--sp-4); gap: var(--sp-3); }
.arasul-checkbox-row { gap: var(--sp-2); }
```

**Title fix (`LeftPane.tsx:357`):** `"New project"` → `"Create project"` for consistency with `"Create vault"`.

**Translate:** line 371 — German checkbox text → English (English-only is a Phase A decision per memory).

### 3.2 The "dotfolder lost on clone" bug
**Diagnosis:** *not actually a clone bug.* `git clone` at `src-tauri/src/projects.rs:209-211` runs without filter flags — dotfolders ARE on disk. The bug is purely visual: `fs.rs:87-92` filters them out for display when `show_hidden=false` (the default).

**Fix:** add a "Show hidden files" toggle.
- `src/components/LeftPane.tsx`: add a small toggle button in the tree-pane header (or in pane-actions menu).
- `src/components/TreePane.tsx`: pass `show_hidden` to `list_tree`.
- Persist preference per-project in `localStorage` so users who want to see `.github/` don't have to re-toggle every session.

Optional improvement (`fs.rs:43-52`): when the project has a `.git` directory, *do* show `.github/`, `.vscode/`, `.claude/` by default but still hide `.git/` itself. These are user-facing config dirs, not VCS internals.

---

## 4. P1 · Settings overhaul (1 day)

Current Settings is functional (7 categories) but missing entire surfaces non-tech users need. Stay with the **sidebar + right pane** pattern; expand from 7 → 11 categories.

### 4.1 New category structure
| # | Category | Status | Adds |
|---|---|---|---|
| 1 | General | exists | (split: theme moves to Appearance) |
| 2 | Appearance | NEW | theme, font size, UI density, accent |
| 3 | Editor | NEW | font, font size, line numbers, word wrap, default mode |
| 4 | Terminal | NEW | font, cols, rows, scrollback |
| 5 | Claude / AI | NEW | model picker, temperature slider, system prompt, MCP servers |
| 6 | GitHub | exists | + repo visibility default, commit message template |
| 7 | Drive | NEW | current root (read-only), free space, eject behavior |
| 8 | Vault | renamed | + lock timeout, lock-on-sleep, lock-on-eject |
| 9 | Privacy | NEW | reassurance copy, "no telemetry" guarantee |
| 10 | Backup | NEW | export keys, full backup .tar.gz, restore |
| 11 | About | exists | + update channel selector |

### 4.2 Top 5 must-add for non-tech users
1. **Claude model + temperature** — most users don't realise they can pick Opus vs Sonnet.
2. **UI density** (Compact/Normal/Spacious) — accessibility without breaking layout.
3. **Auto-lock timeout** (5/15/30/Never) — critical for shared computers.
4. **Default GitHub commit message template** — saves typing on every push.
5. **Privacy reassurance pane** — non-tech users want explicit "no servers, no telemetry."

### 4.3 Settings access
Already wired (⌘, opens). **Add a gear icon to the TopBar far-left** so non-shortcut users find it. Tooltip: "Settings (⌘,)".

---

## 5. P1 · Toast system + error handling (½ day)

### 5.1 Install Sonner
```bash
pnpm add sonner
```
**File:** `src/main.tsx`
```tsx
import { Toaster } from "sonner";
// inside root:
<Toaster position="bottom-left" theme="system" richColors closeButton />
```

### 5.2 Replace silent catches
14 known locations. Centralize the helper:
**New file:** `src/lib/toast.ts`
```ts
import { toast } from "sonner";
import { errorMessage, type ArasulError } from "./errors";

export const notify = {
  ok: (text: string) => toast.success(text, { duration: 2500 }),
  err: (text: string, e?: unknown) => toast.error(text, {
    description: e ? errorMessage(e) : undefined,
    action: e ? { label: "Copy", onClick: () => navigator.clipboard.writeText(String(e)) } : undefined,
    duration: Infinity,
  }),
  loading: (text: string) => toast.loading(text),
  done: (id: string | number, text: string) => toast.success(text, { id }),
};
```

### 5.3 Five must-have toasts
1. File save failure (currently silent) — **data loss prevention**.
2. Vault create / unlock failure — currently shake-only on Unlock; toast adds context.
3. GitHub push / pull failure — currently a tiny icon; toast with "Retry" action.
4. Project create with GitHub auto-repo partial failure — clarify ambiguous state.
5. Long ops (clone > 5s, push > large repo) — `toast.loading` → `toast.success`.

### 5.4 Error type → user message map
**New file:** `src/lib/errors.ts`. Translate `ArasulError.kind` → friendly title + actionable description:

```ts
const map = {
  vault_locked: { title: "Vault is locked", desc: "Unlock to continue.", action: "Unlock" },
  vault_wrong_passphrase: { title: "Wrong passphrase", desc: "Try again — case matters." },
  fs_io: { title: "Couldn't read or write a file", desc: (m: string) => m },
  claude_launch: { title: "Couldn't start Claude", desc: "Is the bundled binary present on the drive?" },
  pty_closed: { title: "Terminal connection lost", desc: "Click to reopen." },
  // ...
};
```

---

## 6. P1 · Editor polish (½ day)

### 6.1 Code blocks
**File:** `src/components/MarkdownEditor.css:123-139`
Replace with:
```css
.arasul-md-canvas pre {
  margin: var(--sp-3) 0;
  padding: var(--sp-4) var(--sp-5);   /* 16/20 — was 14/18 */
  border-radius: var(--radius-sm);    /* 4 — was 6 */
  background: var(--code-block-bg);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: var(--fs-editor-code);
  line-height: 1.65;                  /* was 1.55 */
  overflow-x: auto;
}
.arasul-md-canvas pre code {
  background: transparent; color: inherit; padding: 0; font-size: inherit;
}
.arasul-md-canvas :not(pre) > code {
  font-family: var(--font-mono);
  font-size: 0.88em;
  padding: 2px 6px;                   /* was 1px 6px */
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  color: var(--accent);
}
```

### 6.2 Optional: language label on code blocks
ProseMirror NodeView for `codeBlock` that prepends the language as a small uppercase tag in the top-right corner (like Cursor). Phase 6+.

### 6.3 Copy-button on code blocks
Float a button in the top-right of every `<pre>` on hover. Two-state: idle (`Copy`) → success (`Copied`) → revert after 1.5s.

---

## 7. P1 · Right pane = OpenAra TUI hub (¼ day) — decision locked 2026-04-26

**Decision:** Right pane stays terminal-only. `myhub-tui` (= OpenAra) IS the hub. **No Chat tab. No tab strip.** From inside the TUI the user opens chat, projects, files. ChatPane is rejected.

**Implications:**
- `src/components/ChatPane.tsx` is now dead code. Delete it (and `ChatPane.css`). Remove the "Briefer not wired (Phase 3.2)" stub.
- `src/components/RightPane.tsx` simplifies — no tab strip needed, just the existing terminal mounting `launch_myhub_tui`.
- `src/components/ThreePaneShell.tsx:79-108` (`CompactShell`) — change the right-pane label from "Claude" to "OpenAra" (or drop the label entirely). The "Claude" label was the lie; remove it.
- The earlier `claude::ask_briefer` Tauri command and its frontend caller stop being user-facing. Keep the backend command for now (myhub-tui may still call it from inside the TUI), but no longer wire it to a React component.
- Slash command `/new` in chat goes away with ChatPane. Replace with: when user types `:new` (or hits ⌘N) inside myhub-tui, the TUI fires a Tauri event the LeftPane subscribes to → opens the project-create modal.
- ⌘1 / ⌘2 tab-switch idea is dropped. ⌘T (new tab) and ⌘1-9 (switch terminal tabs) keep working as today — for multiple TUI sessions, not for chat-vs-terminal.

**Files to delete/modify:**
| File | Action |
|---|---|
| `src/components/ChatPane.tsx` | DELETE |
| `src/components/ChatPane.css` | DELETE |
| `src/components/ThreePaneShell.tsx:94` | rename "Claude" → "OpenAra" or drop |
| `src/components/RightPane.tsx` | (unchanged — already correct) |
| `myhub-tui/myhub_tui/app.py` | add Tauri-event emission on `:new` command (out of scope for Phase 1) |

---

## 8. P1 · Tree pane power features (½ day, virtualization is its own day)

**Files:** `src/components/TreePane.tsx`, `LeftPane.tsx`

| Feature | Effort | Priority |
|---|---|---|
| F2 inline rename | 30 min | P1 |
| Type-to-search filter input above tree | 1h | P1 |
| Show-hidden toggle | 30 min | P1 (linked to §3.2) |
| `Copy path` context-menu item | 15 min | P1 |
| New file / folder buttons in pane header | 30 min | P1 |
| Auto-refresh on disk change (poll mtime per 5s, or fs-watcher) | 2h | P1 |
| Multi-select (Shift+click range, Cmd+click toggle) | 2h | P2 |
| Drag-drop reorder | 4h | P2 |
| Virtualization (react-arborist or react-window) | 1 day | P2 |
| Roving tabindex pattern | 2h | P2 |

---

## 9. P1 · Hotkey discoverability (¼ day)

### 9.1 ShortcutsOverlay updates
**File:** `src/components/ShortcutsOverlay.tsx:6-36`
- Add advertised: ⌘T (new terminal), ⌘W (close tab), ⌘1-9 (switch tabs).
- Remove or wire: ⌘B/I/U, ⌘L, ⌘F (clarify scope or implement everywhere).

### 9.2 Settings keymap standard (VS Code defaults)
| Action | Currently | Target |
|---|---|---|
| File find | ⌘P → files | ⌘P → files ✓ |
| Command palette | ⌘K | ⌘⇧P (also keep ⌘K) |
| Project switch | ⌘⇧P | move into command palette |
| Editor find | ⌘F (terminal only) | ⌘F everywhere |
| Project search | ⌘⇧F | ⌘⇧F ✓ |

### 9.3 Hover-shortcut hint banner (Linear pattern)
After 800ms hover on any clickable with a registered shortcut, show a subtle bottom-right banner. Phase 6+ stretch.

---

## 10. P2 · Design tokens (½ day)

**File:** `src/theme.css`

Add the missing tokens identified by the consistency audit:
```css
:root {
  --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.15);
  --shadow-md: 0 8px 24px rgba(0, 0, 0, 0.35);
  --shadow-lg: 0 20px 60px rgba(0, 0, 0, 0.5);
  --fs-xxs: 10px;
  --backdrop: rgba(0, 0, 0, 0.5);
}
```

**Search-and-replace targets** (with file:line evidence in agent reports):
- `EditorPane.css:169,191,208` — replace `#1a1c20`, `#0a0b0d` with `var(--bg-canvas)` etc.
- All `box-shadow:` rules in MarkdownEditor.css → use `--shadow-md` / `--shadow-lg`.
- All modal backdrops → `var(--backdrop)`.
- All `font-size: 10px` → `var(--fs-xxs)`.
- All `gap: 8px` → `var(--sp-2)`. Same for 12/16/24.

### 10.1 Three-tier button system
**File:** `src/theme.css` (utility classes)
```css
.btn { padding: var(--sp-2) var(--sp-4); border-radius: var(--radius); font: inherit; cursor: pointer; transition: background var(--dur-fast); }
.btn.primary { background: var(--accent); color: var(--text-on-accent); }
.btn.primary:hover { background: var(--accent-strong); }
.btn.secondary { background: var(--accent-soft); color: var(--accent); }
.btn.secondary:hover { background: var(--accent); color: var(--text-on-accent); }
.btn.ghost { background: transparent; color: var(--text-secondary); border: var(--border); }
.btn.ghost:hover { background: var(--hover); color: var(--text-primary); }
.btn:disabled { opacity: .5; cursor: not-allowed; }
```
Then sweep all components to use these classes; remove ad-hoc button CSS.

---

## 11. P2 · A11y (¼ day)

| Issue | Fix | File:Line |
|---|---|---|
| Onboarding has no focus trap | call `useFocusTrap(cardRef)` | `src/screens/Onboarding.tsx:90` |
| Unlock has no focus trap, no Escape | wrap form, trap, `onKeyDown` Esc → no-op (or dim) | `src/screens/Unlock.tsx:51` |
| 30 buttons missing `type="button"` | sweep | Onboarding/Settings (line refs in audit report) |
| `DriveEjectedModal` no role | `role="dialog" aria-modal="true" aria-labelledby` | `src/App.tsx:151-165` |
| Tree folders missing `aria-expanded` | add to renderRow folder branch | `src/components/TreePane.tsx:~313` |
| Hidden panels still in tab order | `aria-hidden="true"` + remove from tab flow | `src/components/ThreePaneShell.tsx:45-107` |

Long-term: convert TreePane to roving-tabindex pattern (each row gets `tabIndex={focused ? 0 : -1}`); unblocks virtualization.

---

## 12. P2 · Status bar enrichment (¼ day)

**File:** `src/components/StatusBar.tsx`

Make all items clickable + add:
| Item | Click action |
|---|---|
| Cursor position `12:34` | open "Go to line" dialog |
| File size `4.2 KB` | (none, info) |
| Encoding `UTF-8` | (none, info) |
| Line endings `LF` | toggle CRLF/LF |
| Dirty indicator `●` | force save |
| Branch name | open commit popover (§2) |
| Vault status | click → lock vault |

Don't hide the keyhints below 900px — abbreviate them (e.g. `⌘P files` → `P`) so the bar is always informative.

---

## 13. Cross-cutting principles (apply everywhere)

These are the *vibes* the agents recommended stealing from polished apps:

1. **No focus rings on prose** (iA Writer / Bear) — `:focus-visible { outline: none }` on the contenteditable; signal focus via caret + selection only.
2. **Optimistic + Undo over Confirm** (Linear / Gmail) — for any reversible op, do it, show a 5s toast with `Undo`. Confirm dialogs only for `git push --force` equivalents.
3. **Auto-save, never a Save button** — `write_file` on debounced blur + 600ms idle. Inline "Saved 2s ago" indicator next to filename.
4. **Spring easing on panel transitions** — `cubic-bezier(0.34, 1.56, 0.64, 1)` at ~220ms. Feels alive without being loud.
5. **Empty states with action buttons** — never just "Nothing here." Always offer the next step.
6. **Plain English over jargon** — "Lock code" not "passphrase", "Sync to GitHub" not "push", drop "Briefer" entirely.
7. **Notion-style slash menu** — aliases (`/h1`, `/heading1`, `/title`), recents pinned to top.
8. **Cursor's two-pane palette** — for ⌘P, render preview of the focused file in a right column.
9. **Stagger reveal on tree expand** — children fade in 20ms each. Spatial hierarchy cue.
10. **Shake-on-error fields** — already implemented in Unlock; extend to Commit message field on push failure.

---

## 14. Phase rollout (recommended order)

| Phase | Items | Effort | Visible win |
|---|---|---|---|
| **1** | §1.1, §1.2, §1.3, §1.4, §1.5, §1.6, §1.7 | 1.5d | App not broken on SSD; no blue border; no silent saves; chat is real |
| **2** | §2 (top-bar commit/push) | 0.5d | User explicitly asked — visible feature shipped |
| **3** | §3 (project create + dotfolders) | 0.5d | Modal looks right; cloned dotfolders visible |
| **4** | §5 (toast system) + §4 (settings overhaul) | 1.5d | Errors visible; settings feel mature |
| **5** | §6 (editor polish) + §10 (tokens) | 1d | Markdown finally feels like a polished writer |
| **6** | §7 (right-pane tabs) + §8 (tree power) | 1d | Workflow polish |
| **7** | §9 (hotkeys) + §11 (a11y) + §12 (status bar) | 0.5d | Discoverability + a11y |

**Total ≈ 5.5-6.5 focused days** to land everything. Phases 1-4 alone (3.5d) give the user the experience they're describing.

---

## 15. Out of scope / Phase 7+

These came up but should wait:

- Math/KaTeX in markdown
- Disk-backed attachments NodeView
- Cmd+Enter split-open file
- Tree section labels
- Visual regression snapshots (Chromatic / Playwright)
- MCP server config in Settings
- Keybindings rebinding UI
- Settings search overlay
- GPG-signed commits
- Backup `.tar.gz` export

---

## 16. What we deliberately did NOT recommend

- **Adding shadcn/ui** — irrelevant; this is Tauri + hand-rolled CSS, and the design system is already in `theme.css`.
- **Migrating away from xterm.js / TipTap** — both libraries are working well; cost > benefit.
- **Going web/SaaS** — explicit project goal is portable SSD; no.
- **Adding telemetry** — privacy promise is part of the value prop. Explicit "no telemetry" pane in Settings instead.

---

## 17. Locked decisions (answered 2026-04-26 via interview)

1. **Drive auto-detect** → name-match `/Volumes/myhub`. If absent in production, surface "Pick your drive" picker (Phase 1.1+).
2. **English-only** → already locked in earlier memory; not re-asked. German string in `LeftPane.tsx:371` will be translated.
3. **Toast library** → **Sonner** (`pnpm add sonner`). Mounted in `main.tsx`, helper at `src/lib/toast.ts`.
4. **Right pane** → **OpenAra TUI is the hub. No Chat tab.** ChatPane.tsx + ChatPane.css get deleted. The "Claude" label in CompactShell is a lie — rename to "OpenAra" or drop.
5. **Push behavior** → **One-click + 5-second Undo toast.** Default commit message `"Update from Arasul · ${timestamp}"`. Undo runs `git revert HEAD --no-edit && git push --force-with-lease` (safe — fails if remote moved). No commit modal on TopBar.

These are mirrored in `memory/project_arasul_design_decisions.md` §5-§8 for cross-session persistence.
