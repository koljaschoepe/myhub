---
name: frontend-ux-overhaul
status: in_progress
created: 2026-05-11
last_touched: 2026-05-11
owner: Kolja
related: [master-plan, arasul-plan, vision-v3-ai-workspace, ultimate-polish-plan-v2, arasul-design-spec]
---

## Goal

Bring Arasul (Tauri/React desktop) and myhub-tui (Python TUI) to a coherent, Cursor/VS-Code-grade polish level that feels approachable to non-coders, while closing critical gaps in accessibility, design-system consistency, AI-conversation UX, and TUI ↔ React integration.

## Context

### Why now
Pre-Beta. 17 parallel subagent audits (12 code, 5 web research) executed on 2026-05-11. Findings concentrate in five buckets:
1. **Design system drift** — tokens exist (`theme.css`), but ~15% of spacing, radii, and shadows are hardcoded; no shared component primitives → 5 modal patterns, 8 button variants, 0 tooltips, 3 input styles.
2. **AI UX is raw terminal** — the right pane is xterm.js hosting `myhub-tui`. `ProviderPicker.tsx` exists but is never mounted. No chat-bubble overlay, no streaming indicator, no `@`-mention context, no Apply/Discard for AI-suggested edits. Will scare non-coders.
3. **Language policy clarification** — myhub-tui is German throughout (`"Willkommen bei myhub."`, `"Guten Morgen."`). User decided 2026-05-11 to loosen the English-only rule: arasul-app + content + docs stay English-only, but myhub-tui is permitted German UI strings (operator preference). CLAUDE.md §4 + AGENTS.md hard-rules need a one-line exception edit.
4. **A11y gaps** — `--text-tertiary` fails WCAG AA on canvas (3.48:1 dark / 2.46:1 light); z-index 900/950/1000/1100/1200 stratification missing (modal collisions likely); no Radix Dialog/DropdownMenu/Tooltip primitives; cmdk missing live-region result count; xterm screen-reader mode not exposed.
5. **Non-coder copy** — "Vault", "Provider", "Compile", "Verify", "Briefer" leak through onboarding, command palette, and status bar. Forgot-passphrase recovery copy ("vault must be recreated") frightens.

### What we know (from the 2026-05-11 audit, 17 agents)
- **Foundation strengths**: density system (normal/compact/spacious) works cleanly; `prefers-reduced-motion` already honored; focus-visible rings global; cmdk + lucide-react + Tiptap stack is healthy; English-only **in arasul-app/** confirmed across 42 source files; vault flow is functionally solid.
- **Stack on Arasul side**: React 19 + Vite + TypeScript 5.8 + cmdk + lucide + Tiptap 3 + CodeMirror 6 + xterm v6 + glide-data-grid + zxcvbn-ts + Sonner. NO Tailwind, NO shadcn/ui, NO Radix Themes yet.
- **Stack on TUI side**: Python 3.13 + prompt_toolkit + rich; 14 commands; 37 tests but **zero coverage on command handlers** (`/open`, `/new`, `/delete`, `/git pull/push`, `/claude`, `/brief`, `/lazygit`).
- **TUI ↔ React seam**: two color systems (TUI cyan, React indigo); no SIGWINCH handshake; no OSC event channel back to React; `ProviderPicker.tsx` (299 lines) is dead code.
- **Tauri 2 leverage left on the table**: `trafficLightPosition` since 2.4 (no `cocoa` crate hackery needed); `tauri-plugin-window-state` not installed; `tauri::ipc::Channel` not used for `claude` streaming; no native menu bar (so macOS Spotlight + Help search can't find Arasul actions).
- **Research north-stars**: Tailwind v4 `@theme` + shadcn/ui copy-in components fits Tauri/Vite cleanly (no SSR, no version drift). Cursor two-palette model (Cmd+K inline edit / Cmd+L chat). Granola two-tone canvas (user dark, AI gray, every AI sentence linked to source). Cursor 2.0 Composer aggregated diff before any file write. Smashing Magazine "Autonomy Dial" pattern.

### What we are NOT doing
- **Not retiring myhub-tui.** Stays as standalone SSH mode and right-pane TUI; but rewritten English-only.
- **Not introducing an Anthropic/OpenAI SDK** to power the chat overlay. The chat overlay still drives `claude` subprocess; we parse its stdout (or use `claude -p` headless with JSON output) to render bubbles.
- **Not adopting Radix Themes.** Tokens from §1.3 stay sovereign; we install Radix *primitives* only (Dialog, DropdownMenu, Tooltip, Toast, Popover).
- **Not building a system tray.** Per Tauri-research findings: wrong pattern for a portable USB app — dangling tray icon on SSD eject confuses users.
- **Not building cross-platform parity in this plan.** Mac-first ships; Linux/Windows tracked separately. CSS audited against Safari Technology Preview as a proxy for WebKitGTK.
- **No automated user testing this cycle.** Hand-grading copy + 3 friend testers between phases.

---

## Phase 0 — Quick Wins (1–3 days total) ✓ DONE 2026-05-11

Low-risk polish cherry-picked from every audit. Ship these first; they de-risk the bigger phases and produce visible improvements.

- [x] 0.1 Replaced `"No results."` empty state in `CommandPalette.tsx:130` with "No matches — try a different search." — done 2026-05-11
- [x] 0.2 Added `aria-label` to icon-only buttons: HeadingPicker (`MarkdownToolbar.tsx`), TopBar update pill (`TopBar.tsx`), ContextMenu items (`ContextMenu.tsx`, icons marked `aria-hidden`). — done 2026-05-11
- [x] 0.3 Per-counter `title` + `aria-label` on git counters (`StatusBar.tsx:108-110`): ↑N → "N commits ahead of GitHub", ↓N → "N behind", ●N → "N files changed". Lucide icons marked `aria-hidden`. — done 2026-05-11
- [x] 0.4 ShortcutsOverlay: added `⌘;` (focus mode) to Workspace section and new "View" section with `⌘+`/`⌘−`/`⌘0` (PDF zoom). — done 2026-05-11
- [x] 0.5 Non-coder copy rewrites in 5 surfaces: Unlock footer, RightPane locked placeholder, Onboarding passphrase intro (added trust line), TopBar empty state, LeftPane git-disconnected (added "Connect" link → dispatches `arasul:open-settings` { tab: "github" }, App.tsx + Settings.tsx wired). — done 2026-05-11
- [x] 0.6 Added `title={briefer}` to TopBar briefer span (`TopBar.tsx:130`). — done 2026-05-11
- [x] 0.7 Double-click rename in tree: `onDoubleClick` on `.arasul-tree-row` mirrors F2, dirs ignored. — done 2026-05-11
- [x] 0.8 Auto-select basename on rename mount (preserves extension): `onFocus` calls `setSelectionRange(0, lastIndexOf("."))`. — done 2026-05-11
- [x] 0.9 `--text-tertiary` bumped to `#7A8596` (dark, ~6:1) and `#71717A` (light, ~4.7:1) — clears WCAG 1.4.3 AA. Inline comments added. — done 2026-05-11
- [x] 0.10 Added `--radius-pill: 9999px` token to `theme.css`. (5 hardcoded radius replacements deferred to Phase 1.3 radius-scale rollout.) — done 2026-05-11
- [x] 0.11 Added icon-size tokens (`--icon-xs/sm/md/lg/xl`) to `theme.css`. — done 2026-05-11
- [x] 0.12 Renamed "Compile wiki" → "Refresh wiki" and "Verify drive" → "Check drive" in `CommandPalette.tsx`. (Tauri invoke names `compile` / `verify` unchanged.) — done 2026-05-11
- [x] 0.13 Added `position: relative; z-index: 7` on `.arasul-myhub-error` (above the `z-index: 6` search overlay). — done 2026-05-11
- [x] 0.14 Fuzzy match in slash menu: new `fuzzyMatches()` helper — substring still wins ranking, fuzzy is fallback. Covers `/tabl` → "Table", `/summ` → "Summarize". — done 2026-05-11

## Phase 1 — Design System Foundation

Adopt Tailwind v4 (CSS-first) + shadcn/ui copy-in components + Radix UI primitives. Establish authoritative token scales. Phase 1 is the *substrate* every later phase builds on; do this before refactoring components.

- [x] 1.1 Installed Tailwind v4 + `@tailwindcss/vite` (devDeps); `@import "tailwindcss"` at top of `theme.css`; `@theme` block at end maps CSS vars → utility namespaces (`bg-canvas`, `text-body`, `p-3`, `shadow-elev-3`, etc.). `vite.config.ts` wired with the plugin. — done 2026-05-11
- [x] 1.2 Installed Radix primitives: `@radix-ui/react-{dialog, dropdown-menu, tooltip, popover, select, switch, radio-group, tabs, context-menu, slot}`. Skipped `react-toast` (Sonner already covers it). — done 2026-05-11
- [x] 1.3 New tokens added **additively** in `theme.css`:
      - **Spacing**: `--space-0/-px/-1/-2/-3/-4/-5/-6/-8/-10/-12` = `0/1/2/4/8/12/16/24/32/48/64`px (legacy `--sp-N` preserved as aliases).
      - **Type scale**: `--text-caption/-body-sm/-body/-body-lg/-h4/-h3/-h2/-h1/-display` + `--leading-tight/-body/-loose` (legacy `--fs-*` preserved).
      - **Semantic colors** in both dark + light: `--bg-surface/-overlay/-sunken`, `--border-default`, `--text-muted/-disabled`, `--accent-hover/-active/-fg`, `--danger-hover`, `--success-hover`, `--info`, `--info-soft`.
      - **Radius**: added `--radius-md/-xl/-2xl/-full` (legacy `--radius-sm/-/--lg` kept; `--radius-pill` added in Phase 0.10).
      - **Elevation**: `--elev-1..--elev-4` with dark-aware shadow + 1px inner border; light-mode counterpart overrides in `[data-theme="light"]`. — done 2026-05-11
- [x] 1.4 z-index stratified: added `--z-base/-sticky/-overlay-local/-overlay-pane/-overlay-editor/-modal-default/-modal-important/-modal-critical/-modal-top` tokens. Migrated 14 numeric `z-index:` declarations across App.css, Settings.css, CommandPalette.css, ShortcutsOverlay.css, ContextMenu.css, SearchPanel.css, LeftPane.css (×2), MarkdownEditor.css (×4), EditorPane.css (×3). Only sub-modal numerics (2/3/6/7) remain — collision risk zero. — done 2026-05-11
- [x] 1.5 Built the shared component layer in `arasul-app/src/components/ui/` — 15 primitives across 3 tiers. — done 2026-05-11
      - [x] **Tier 1 (Phase 1.5 first batch, done 2026-05-11):**
            - [x] Button (variants: primary / secondary / ghost / destructive / link; sizes sm/md/lg; loading state; asChild via Radix Slot)
            - [x] IconButton (Lucide + built-in Tooltip wrapper; 24/32/40px hit-area satisfying WCAG 2.5.8; auto-tooltip from `label` prop)
            - [x] Tooltip (Radix-based; 1.5s default delay; TooltipProvider mounted in main.tsx with skipDelayDuration=300)
            - [x] Dialog (Radix; replaces `.arasul-modal*` + `.arasul-cmdk-overlay` patterns; built-in close button + title + description slots; sm/md/lg/xl sizes; focus trap + restore + Escape for free)
            - [x] Supporting: `lib/cn.ts` (clsx + tailwind-merge helper), `@theme` fg/* naming patch (so utilities read `text-fg` not `text-text`), barrel export at `components/ui/index.ts`
      - [x] **Tier 2 (Phase 1.5 second batch, done 2026-05-11):**
            - [x] DropdownMenu (Radix click-triggered; Item/CheckboxItem/RadioItem/Sub/Separator/Label/Shortcut; `destructive` prop on Item)
            - [x] ContextMenu (Radix right-click-triggered; identical visual API to DropdownMenu; replaces custom `ContextMenu.tsx` in Phase 1.9)
            - [x] Badge (`tone={neutral|accent|success|warning|danger|info}` × `variant={soft|solid|outline}` = 18 cells via cva compound variants)
            - [x] FormField (`useId` + `htmlFor` + `aria-invalid` + `aria-describedby` wiring; render-prop pattern; required asterisk; description above/below)
      - [x] **Tier 3 (Phase 1.5 third batch, done 2026-05-11):**
            - [x] Input (`leading`/`trailing` slots; size sm/md/lg; auto data-invalid handling)
            - [x] Textarea (resize-y, invalid state mirrors Input)
            - [x] Select (Radix; Trigger/Content/Item/Separator/Label/Group; replaces native `<select>` in Settings/Onboarding for cross-platform consistency)
            - [x] Switch (Radix; sm/md sizes)
            - [x] Checkbox (Radix; `indeterminate` state; sm/md sizes — installed `@radix-ui/react-checkbox` for this)
            - [x] RadioGroup + RadioGroupItem (Radix; doubles as plain-list or card-style picker)
            - [x] Tabs (Radix; horizontal default + vertical orientation for Settings sidebar)
- [x] 1.6 Migrated `Settings.tsx` (878 → 800 lines, all 11 tabs) to new primitives — Dialog (Radix focus-trap replaces `useFocusTrap`), vertical Tabs with sidebar layout, Button (×20+), Input (×8), Select (×11 native → Radix), Switch (replaces custom Toggle helper), RadioGroup (theme + density card-style pickers), FormField (auto useId + aria wiring), Textarea (Claude system prompt), Badge (Health status + Updates status). Health-issues list now uses `text-danger`. Legacy CSS rules (`.arasul-kv`, etc.) kept for now — clean up during follow-up audit. — done 2026-05-11
- [x] 1.7 Migrated Onboarding + Unlock screens to new primitives. Unlock: Input (with `trailing` slot for show/hide eye toggle), Button, FormField-style error wiring via aria-describedby. Plus friendly error mapping (`vault_corrupt` → "Drive unlock file is damaged. Try ejecting and reconnecting." instead of raw Rust error kind). Onboarding: Input (4 fields with show/hide toggle on passphrase), Button, Switch (replaces checkbox in auto-launch step), Badge (Installed / Not installed yet status), FormField wraps. Dropped `useFocusTrap` (full-screen screens don't need it). **Bonus**: shipped Phase 4.2 (show/hide password) + parts of Phase 4.4 (friendly error map) early via the new primitives. — done 2026-05-11
- [x] 1.8 Migrated CommandPalette to Dialog primitive. Dropped `useFocusTrap` import + custom `.arasul-cmdk-overlay` wrapper div. Radix handles modal/focus-trap/Escape; cmdk internals (Command.Input/List/Group/Item) untouched. DialogContent classNames override default padding + pin to 20vh from top (palette convention). — done 2026-05-11
- [x] 1.9 Migrated TreePane right-click menu to Radix ContextMenu (Tier 2 primitive). Per-row `<ContextMenu>` + `<ContextMenuTrigger asChild>` wrapping; menu items inline as JSX. Imperative `setMenu({x,y,node})` state dropped. Audit findings E1 (no keyboard nav) + E3 (no submenu support) resolved by Radix. Deleted superseded `components/ContextMenu.{tsx,css}` (was 90+60 lines of dead code). — done 2026-05-11
- [x] 1.10 Wrote `docs/design/tokens.md` — full token reference with dark/light tables, AA contrast notes, migration policy, Tailwind utility mapping. — done 2026-05-11

## Phase 2 — Accessibility (WCAG 2.2 AA) + English-Only Enforcement

- [x] 2.1 Universal focus-visible rule in `theme.css` covers native interactives (button/a/input/textarea/select/summary/[tabindex]) plus 13 Radix/ARIA roles (button/link/menuitem/menuitemcheckbox/menuitemradio/tab/option/combobox/treeitem/switch/checkbox/radio). `--focus-ring` is already two-layer (2px solid accent + 4px translucent halo) — legible on canvas + accent-soft. — done 2026-05-11
- [x] 2.2 Universal sledgehammer added inside the existing `@media (prefers-reduced-motion: reduce)` block: `*, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }`. Catches any rogue hardcoded duration. Existing `--dur-*` token zero-out kept. — done 2026-05-11
- [x] 2.3 24×24 minimum hit area enforced on 5 legacy buttons that audited under: `.arasul-keyhint` + `.arasul-status-clickable` (StatusBar), `.arasul-update-pill` + `.arasul-push-btn` (TopBar), `.arasul-git-connect` (LeftPane). All bumped to `min-height: 24px` + extra horizontal padding — visual stays compact. Tiptap toolbar (`--toolbar-btn: 28px`), TopBar icon-btn (24×24), and new ui/ IconButton primitive (24/32/40 by size) were already compliant. — done 2026-05-11
- [x] 2.4 `scroll-padding-top: calc(var(--toolbar-h) + var(--space-3))` on `.arasul-md-editor` (the markdown editor's scroll container, which has a sticky toolbar). The app shell's TopBar is a flex row, not sticky, so it doesn't need scroll-padding. Satisfies WCAG 2.4.11 (Focus Not Obscured) for anchor-link jumps and keyboard focus moves. — done 2026-05-11
- [x] 2.5 cmdk live-region: new `<CmdkResultAnnouncer>` component uses `useCommandState` to read `filtered.count` and renders an `aria-live="polite"` sr-only region announcing "N results" / "1 result" / "No matches" as the user types. Auto-skipped when query is empty (no useful announcement). — done 2026-05-11
- [x] 2.6 Tiptap toolbar a11y wired to W3C ARIA Authoring Practices: (1) roving tabindex — only one button in tab order, `tabIndex={index === activeIndex ? 0 : -1}`; (2) Arrow Left/Right/Home/End walk the toolbar; Tab leaves to next focusable after the toolbar; (3) **Alt+F10** (Win/Linux) and **Cmd+F10** (Mac) focus the first toolbar button from anywhere in the editor; (4) **Esc** returns focus to the editor; (5) polite live region announces toggle state ("Bold on" / "Bold off") for every formatting action — so ⌘B/⌘I/⌘U keyboard shortcuts also announce. `aria-pressed` already set, kept. HeadingPicker also gets keyboard option-list nav + Esc-to-trigger return. — done 2026-05-11
- [ ] 2.7 CodeMirror 6 + xterm.js screen-reader mode: expose one shared toggle in Settings → Accessibility. CM6 disables tab-indentation in SR mode (Tab leaves editor); xterm exposes `screenReaderMode` option.
- [x] 2.8 SpreadsheetEditor wrapped in `<div role="region" aria-label="Spreadsheet · sheet {name}">`. `onGridSelectionChange` callback computes "Row N of M, column X, value Y" message and writes to a polite live region. Duplicate-suppression via `lastAnnouncedRef` so the same cell doesn't announce twice. glide-data-grid renders to canvas — the live region is the only way SR users hear cell focus moves. — done 2026-05-11
- [x] 2.9 Sonner verified WCAG 4.1.3 compliant: container wraps the toast list in `aria-live="polite"` + `aria-relevant="additions text"` + `aria-atomic="false"`. This is the W3C-recommended status-message pattern — polite is correct because our `notify.ok`/`notify.err` are non-blocking. Set explicit `containerAriaLabel="Notifications"` in `main.tsx` for clearer SR announcements + documented the pattern in a long comment. — done 2026-05-11
- [ ] 2.10 Install `@axe-core/react` + Playwright `axe-playwright`; add CI job that fails on new violations. Baseline existing.
- [x] 2.11 **TUI language policy update** — decision 2026-05-11: myhub-tui MAY keep German UI strings. CLAUDE.md §4 + AGENTS.md "Conventions: Language" updated with the one-line exception. Code identifiers, comments, and commit messages remain English everywhere. — done 2026-05-11
- [ ] 2.12 Add 6 missing test files for TUI command handlers: `test_project_commands.py`, `test_git_commands.py`, `test_ai_commands.py`, `test_brief.py`, `test_compile.py`, `test_verify.py`. Mock `subprocess.run`. Catches regressions in subprocess-heavy command surface.
- [x] 2.13 Verified `resolve_claude` already lives in `core/bin_resolve.py` (extraction was done at some earlier point — audit was stale). Both `commands/ai.py` and `commands/brief.py` import from there. Updated `.claude/rules/myhub-tui.md` to drop the outdated "currently duplicated" note. — done 2026-05-11

## Phase 3 — Shell, Tauri Chrome, Navigation Mechanics

- [x] 3.1 `trafficLightPosition: { x: 16, y: 14 }` added to `tauri.conf.json` (Tauri 2.10.3 is well above the 2.4 where the native API landed). Vertically centers the traffic lights inside the 40px-tall TopBar. Existing `titleBarStyle: "Overlay"` + `hiddenTitle: true` + `windowEffects.effects: ["sidebar"]` (= vibrancy) kept. — done 2026-05-11
- [x] 3.2 `tauri-plugin-window-state` already installed (`Cargo.toml`) and registered in `lib.rs` with default `StateFlags::ALL` — auto-save on close, auto-restore on open. Frontend JS pkg not needed for the default behavior. Per-vault keying + monitor-intersection validation deferred (would need a custom storage adapter; default per-app keying is fine for now). — done 2026-05-11
- [ ] 3.3 Build `<DragRegion>` HOC: applies `data-tauri-drag-region` to wrapper, auto-negates on every interactive child (Buttons, cmdk triggers, lucide icon buttons).
- [ ] 3.4 Add native macOS menu bar via Tauri `MenuBuilder` / `SubmenuBuilder`. One action registry feeds: (a) native menu, (b) cmdk command list, (c) global accelerators. Each menu item has a keyboard equivalent.
- [ ] 3.5 Add `window-vibrancy` crate for NSVisualEffectView underlay (Cursor / Linear / Arc aesthetic).
- [ ] 3.6 Background updater banner: disable Tauri's default modal dialog; split `download()` from `install()`; surface a non-modal toast in the status-bar strip; defer restart if a `claude` subprocess is mid-run.
- [x] 3.7 Pane state persistence via react-resizable-panels' built-in `useDefaultLayout({ id })` hook → localStorage. Separate keys per shell variant (`arasul.shell.full.v2`, `arasul.shell.medium.v2`). Survives reloads. Storing to `memory/config.toml` deferred — localStorage is fine until per-vault state matters. — done 2026-05-11
- [x] 3.8 Built-in to react-resizable-panels v4's `<Separator>` (its default behavior, unless `disableDoubleClick` is set). Double-click resets to the current `defaultLayout` — which 3.7 now persists. — done 2026-05-11
- [x] 3.9 Verified: `App.tsx` lines 194/200/203/206 already use unique `key="splash"/"onboarding"/"unlock"/"main"` on each screen root. State transitions cleanly unmount/remount via React's diff. No flash. — done 2026-05-11
- [x] 3.10 Added `HelpCircle` button to StatusBar right-side cluster — fires `⌘/` synthetic keydown, opening ShortcutsOverlay. Stays visible at every breakpoint (incl. compact <900px where the keyhint row hides). `aria-label="Show keyboard shortcuts"`. — done 2026-05-11
- [ ] 3.11 Migrate `claude` subprocess streaming from `emit` events to `tauri::ipc::Channel` (Rust-side batching at ~30fps before pushing). Removes per-line IPC overhead.
- [x] 3.12 `LocalTrustPill` component in TopBar — `ShieldCheck` icon + "Local" label in success tone. Click opens a Radix Popover with plain-English copy ("Your notes never leave this drive."), the three exact network endpoints we use (api.anthropic.com / GitHub Releases / github.com push), and a "More in Privacy settings →" link that dispatches `arasul:open-settings { tab: "privacy" }`. Arc-browser pattern. — done 2026-05-11

## Phase 4 — Onboarding & Trust (Non-Coder Voice)

Voice rewrite + 6 concrete new UX moves. Reframe vault as drive-unlock; introduce kitchen-table naming.

- [x] 4.1 Voice rewrite cleanup pass: swept remaining "Vault" / "Lock vault" / "vault locked-unlocked" surfaces to "Drive lock" / "Lock drive" / "drive locked-unlocked" across App.tsx, Settings.tsx (tab label "Vault" → "Drive lock" + body copy), Onboarding.tsx, CommandPalette.tsx (group + item), ShortcutsOverlay.tsx, StatusBar.tsx, TopBar.tsx briefer. Code identifiers (`vault`, `setVault`, `VaultState`), IPC commands (`vault_*`), `vault.enc` filename, `docs/vault-decision.md` refs all kept — purely user-facing rename. "Compile" → "Refresh" and "Verify" → "Check" were already done in Phase 0.12. — done 2026-05-11
- [x] 4.2 Show/hide password toggle shipped during Phase 1.7 migration — Input.trailing slot + IconButton with Eye/EyeOff Lucide. Toggles both Onboarding passphrase fields together (single `showPassword` state) and the Unlock input. — done 2026-05-11
- [x] 4.3 Caps-Lock detector on Unlock + both Onboarding passphrase fields. `onKeyDown`/`onKeyUp` call a `checkCapsLock` callback that reads `e.getModifierState("CapsLock")`. Hint renders inline below the input in warning amber (not red — informational), suppressed when an error is already shown so we don't double-stack. Auto-clears on Caps Lock release. — done 2026-05-11
- [x] 4.4 Friendly error mapping shipped during Phase 1.7. `vault_corrupt` → "Drive unlock file is damaged. Try ejecting and reconnecting the drive."; `fs_*` errors → "Couldn't read the drive. Check it's connected and try again."; everything else falls back to a clear "Unlock failed: {kind}" with the underlying kind appended (no raw Rust panics surfaced). — done 2026-05-11
- [x] 4.5 Onboarding gets a header strip with: (1) Back button — disabled on step 1 (welcome), enabled on 2/3/4, also disabled while a step is busy/installing so a mid-flight `create` can't be orphaned; (2) "Step N of 4 · {Step Label}" indicator wrapped in `aria-live="polite"` so screen readers announce each transition. Form state (name, passphrase, confirm, autoLaunch) survives Back/Next because it lives at the component level. — done 2026-05-11
- [ ] 4.6 Jobs-based first question post-onboarding ("What do you want to do today?" → 4 chips: Write, Research, Build a workflow, Just exploring) that filters CommandPalette's surfaced commands + greeter copy.
- [ ] 4.7 Synthetic sample workspace on first launch (1 project named "Welcome", 3 markdown notes, 1 workflow, 1 spreadsheet). Empty-state cannot break the tutorial. Removable from Settings.
- [ ] 4.8 "Membership card" end-of-onboarding moment: a personalized welcome markdown doc auto-created in the user's first project. Persistent. Editable.
- [x] 4.9 Trust callout in passphrase step: success-tone box with ShieldCheck icon. Copy: "Your data stays on this drive. Files, settings, and chat history are written only to the USB-C SSD in your hand. The only thing that goes over the network is your Claude prompts — straight to `api.anthropic.com` on your own subscription." Specific endpoint name (vs the previous vague "no cloud") is what the non-coder UX research agent flagged as the trust-building move. — done 2026-05-11

## Phase 5 — Tree, Search, Files

- [ ] 5.1 Drag-and-drop file reorder + move-into-folder in `TreePane.tsx`; add `mkdir` and `move` commands to `src-tauri/src/fs.rs`.
- [ ] 5.2 Multi-select with Ctrl/Shift+click; `selectedNodes: Set<string>` state; batch delete / move / copy-paths.
- [ ] 5.3 Add `mkdir` Tauri command so create-folder doesn't write `.gitkeep` (currently `TreePane.tsx:291,361` leaves a spurious file).
- [ ] 5.4 Regex + whole-word toggles in `SearchPanel.tsx`; pass to ripgrep in `search.rs`.
- [ ] 5.5 Replace UI in SearchPanel — second tab "Replace" with preview + confirm.
- [ ] 5.6 Line-jump on search-hit click: emit `editor:jump-to-line` event; MarkdownEditor + CodeMirror consume.
- [ ] 5.7 "Recent" collapsible group at top of TreePane (top 5 from `recentFiles.ts`) with hover-pin.
- [ ] 5.8 Preview-tab pattern (VS Code): single-click opens italic-titled tab reused on next single-click; edit or double-click promotes. Massively reduces tab explosion for non-coders.
- [ ] 5.9 Editor tabs polish: dirty-state ● dot, middle-click closes, drag-reorder, pinning, close confirmation if dirty.
- [ ] 5.10 ContextMenu adds "Copy relative path" (useful for non-coders authoring markdown links).
- [ ] 5.11 Tooltip on truncated filenames (`TreePane.tsx:217`): add `title={node.name}` to the name span (currently only the row has `title`).

## Phase 6 — Editor Suite Polish

- [ ] 6.1 WYSIWYG find/replace overlay for Markdown editor (replaces "toggle to source mode" workaround).
- [ ] 6.2 Tiptap drag-drop image upload via Tauri file picker; persist into project-local `images/` folder; insert relative path.
- [ ] 6.3 Heading-picker color coding per level (Notion pattern): H1 accent, H2 secondary accent, etc.
- [ ] 6.4 Outline / TOC panel: collapsible right-side strip with heading list; jump-on-click.
- [ ] 6.5 Inline AI prompt resizable (currently fixed 200px in `MarkdownEditor.tsx:532-560`).
- [ ] 6.6 Bubble menu / floating menu adds Cursor-style "Ask AI about selection" entry, hooks Phase 8.
- [ ] 6.7 Spreadsheet: **Undo/Redo stack** (Cmd+Z / Cmd+Shift+Z) — track `CellEdit[]` history; emit invalidations.
- [ ] 6.8 Spreadsheet: **Copy/Paste** (Cmd+C / Cmd+V) for cell ranges → TSV / CSV.
- [ ] 6.9 Spreadsheet: column freeze (`frozenColumns` prop on glide DataEditor) + per-column resize handle, persist widths.
- [ ] 6.10 Spreadsheet: formula recalc optimization — cache `Map<"row,col", EvalResult>`, invalidate only dependent cells (BFS over DAG). Fixes jank on 1000+ cell sheets.
- [ ] 6.11 Spreadsheet: dedicated formula bar above grid (`fx: =`), edit context clear.
- [ ] 6.12 Spreadsheet: horizontal scroll / sheet picker for 10+ sheet tabs.
- [ ] 6.13 Workflow editor: ⌘⏎ shortcut to Run; line-error highlighting on YAML parse failure.
- [ ] 6.14 Scroll-position memory per file when switching tabs.

## Phase 7 — Command Palette + Shortcuts

- [ ] 7.1 Two-palette model (Cursor pattern): keep `Cmd+K` as the global command palette; add `Cmd+L` as "Focus AI chat" (Phase 8 wires the right pane).
- [ ] 7.2 Inline keyboard hints next to every command in palette (Linear pattern). Train shortcuts passively.
- [ ] 7.3 Recent-commands boost at the top of the palette result list.
- [ ] 7.4 Categorize commands into named sections (Workspace, AI, Editor, View, System) with visual dividers.
- [ ] 7.5 Highlight fuzzy-match chars with `background: var(--accent-soft)` (currently text-only — easy miss).
- [ ] 7.6 Keyboard nav inside ContextMenu (Radix gives this for free after Phase 1.9).
- [ ] 7.7 Shortcut conflict cleanup: scope `⌘W` to active pane (currently both EditorPane and RightPane close); document this.
- [ ] 7.8 Show inline "(Only in rendered view)" hint when ⌘B/I/U is pressed in Markdown source mode (currently silently ignored).
- [ ] 7.9 ShortcutsOverlay sections become collapsible; add a search field at top.
- [ ] 7.10 Tooltip after 1.5s hover on any toolbar button or tree action showing **label + matching shortcut** (Linear pattern). Passive education.

## Phase 8 — AI Workspace UX (THE differentiator)

This is the headline phase. Today the right pane is a raw terminal; non-coders see a black box. We add a chat overlay, context bridge, and approval/Undo controls — without breaking the `claude` subprocess invariant.

- [ ] 8.1 Wire `ProviderPicker.tsx` (currently orphaned, 299 lines of dead UI) into:
      - Settings → "AI Engine" tab
      - A dropdown chip in RightPane header
      - Onboarding step 3 (current "Connect Claude" generalises to multi-provider)
- [ ] 8.2 Build `ChatPane.tsx` overlay on top of the terminal (split: terminal below, chat above; resizable; toggleable):
      - Hosts a structured chat with user / assistant bubbles
      - Two-tone canvas (Granola): user text full-contrast, AI text muted; every AI sentence linked back to its source paragraph (wiki / file)
      - Streaming via `claude -p` headless with JSON output, or by parsing the existing PTY's ANSI; whichever is more stable
      - Markdown render (`react-markdown`) with syntax-highlighted code blocks (existing `lowlight` dep)
      - Copy button + "Insert into editor" button on every AI code block
- [ ] 8.3 "Claude is thinking..." status: `● thinking → ● streaming → ○ idle` pill in the RightPane header; emit state from the chat backend.
- [ ] 8.4 Context bridge: thread `currentOpenFile` and `selection` from EditorPane through to the AI backend via env var + IPC. AI receives editor context automatically.
- [ ] 8.5 `@`-mention system inside the chat input: `@file`, `@folder`, `@project`, `@selection`, `@wiki` autocomplete from `content/` tree → chip attachments under the prompt (Cursor pattern).
- [ ] 8.6 Cmd+K inline edit: select text in Markdown / CodeMirror → ⌘K → tiny prompt bar above selection → AI returns a diff → Accept / Discard / Open in editor (Cursor pattern; effectively absorbs the existing `MarkdownEditor.tsx` inline AI but generalises across editors).
- [ ] 8.7 Aggregated diff card (Cursor 2.0 Composer): when AI proposes edits to multiple files, single review surface with per-file Approve / Reject + "Apply all".
- [ ] 8.8 Action timeline + Undo: every AI file-write goes into a timeline (collapsible side panel); one-click Undo reverts.
- [ ] 8.9 Autonomy slider in Settings → AI Engine: 3 named stops ("Ask before everything", "Ask before writing files" — default, "Just do it"). Surfaces inline in chat header.
- [ ] 8.10 Memory panel (browsable + editable): list of facts the AI remembers about the user (sourced from `~/.claude/CLAUDE.md` + `memory/MEMORY.md`). User can edit or revoke entries (Claude.ai pattern, more legible than ChatGPT's silent memory).
- [ ] 8.11 Sample prompts on the empty chat state (4 cards: "Summarize a note", "Draft an email", "Plan my week", "Explain this file"). Tap to insert.
- [ ] 8.12 Citations on AI answers when wiki context was used: numbered chips with hover-preview + exact-paragraph highlight inside the wiki viewer (Perplexity pattern).
- [ ] 8.13 Update `docs/arasul-design-spec.md` §2.2 to reflect ChatPane reality (currently "Chat (streaming)" — never implemented).

## Phase 9 — TUI ↔ Arasul Integration

Bridge the two halves so they stop feeling like two products glued together.

- [ ] 9.1 Shared theme bridge: React writes current theme tokens (accent, background, text colors) to `$ARASUL_ROOT/.boot/.current-theme.json`; `myhub-tui` reads at startup + on SIGUSR1 to swap Rich color palette. Bonus: TUI dark/light follows app.
- [ ] 9.2 OSC event bridge: custom OSC handler in xterm.js for sequences like `OSC 9999 ; open-editor:<file>:<line> ST`, `switch-project:<slug>`, `show-toast:<message>:<level>`. TUI emits via `print("\x1b]9999;open-editor:...\x07")`; React reacts.
- [ ] 9.3 SIGWINCH handshake: on Arasul window/pane resize, send signal to TUI so `prompt_toolkit` re-layouts immediately (no need to re-run a command).
- [ ] 9.4 Unify scrollback config: single source `useAppConfig().terminal.scrollback`; both `Terminal.tsx` and `RightPane.tsx` xterm instances read it; re-create on change.
- [ ] 9.5 Padding consistency: tabs / head / body all use `--space-5` (16px); document any intentional exception in CSS comment.
- [ ] 9.6 Tab visibility race: replace 30ms heuristic in `RightPane.tsx:307-313` with `ResizeObserver`-triggered `fit.fit()` on visibility flip.
- [ ] 9.7 Document `Cmd+K` reservation: explicit comment in `App.tsx:131`; TUI must not bind `Cmd+K`.
- [ ] 9.8 Process lifecycle cleanup: on tab close, send SIGTERM with 2s grace then SIGKILL; clear `.boot/.respawn` stale marker.
- [ ] 9.9 Scrollback journaling: optional persist xterm scrollback to `memory/terminals/<session-id>/scrollback.txt` on close → re-attach reads it on next open.
- [ ] 9.10 256-color audit: verify xterm theme covers TUI's truecolor / 256-color usage (logo gradients, bar charts).

## Phase 10 — Settings & Preferences

- [ ] 10.1 Per-section "Reset to defaults" button for General / Editor / Terminal / Privacy (not Vault, not Drive).
- [ ] 10.2 Search field at top of Settings (`@modified` filter): typing surfaces matching prefs across all tabs; "modified" badge on changed items (VS Code pattern).
- [ ] 10.3 Field-level validation feedback: name input maxLength + char count; passphrase length hint; temperature slider live `<output>` + min/max labels.
- [ ] 10.4 Dirty indicator per-section: amber dot next to tab name if unsaved changes; "Save changes" + "Discard" appears at section bottom.
- [ ] 10.5 Sensitive-op confirmations: "Wipe all data" button in Privacy tab with double-confirm modal; "Change master passphrase" with success toast before lock.
- [ ] 10.6 Plain-English help text on every non-obvious field (auto-lock minutes → "Drive locks after X minutes of app inactivity"; scrollback → "Lines of terminal history kept").
- [ ] 10.7 Accessibility tab (new): screen-reader mode toggle (covers CodeMirror + xterm + glide-grid), font-size scaling, reduce-motion override, high-contrast theme variant.

## Phase 11 — Testing & Tooling

- [ ] 11.1 Storybook (or Ladle for Vite) for the new `components/ui/` primitives. One story per variant.
- [ ] 11.2 Playwright e2e suite: unlock flow (correct + wrong + caps-lock), onboarding (all 4 steps + skip), open file → edit → save, command palette open + run.
- [ ] 11.3 axe-core integrated into Playwright e2e: every test asserts no new violations.
- [ ] 11.4 Visual regression: Chromatic or Percy against Storybook + key Playwright snapshots.
- [ ] 11.5 TUI command handler tests (delivered in Phase 2.12 but verify pytest CI integration).
- [ ] 11.6 Bundle-size budget: track Tiptap + CodeMirror + glide-data-grid + xterm + lucide footprint; warn if a PR pushes uncompressed total >15 MB.
- [ ] 11.7 Lint rule: forbid hardcoded hex colors / pixel values outside `theme.css` + `tokens.md` (custom stylelint rule).

---

## Risks / Open Questions

- **R1 — Tailwind v4 adoption cost.** Existing CSS is ~3,000 lines hand-authored. Migration is gradual (Tailwind utilities + existing `.arasul-*` classes coexist), but expect 2–3 days of pure refactor friction before payoff. Mitigation: migrate Settings + Onboarding + new components first; keep editor / terminal CSS untouched until Phase 6.
- **R2 — ChatPane vs. xterm coexistence.** The right pane currently hosts xterm hosting `myhub-tui` hosting `claude`. Adding a ChatPane above it means either (a) split-pane mode where both are visible, or (b) tab switcher. Both lose some of the "raw terminal escape hatch" feel. Decision required during Phase 8 kickoff.
- **R3 — `claude -p` JSON output stability.** Phase 8.2 depends on parsing structured JSON from headless `claude -p`. The CLI flag set evolves quickly; verify `--output-format=json` is supported at the time of Phase 8 start, else fall back to parsing the ANSI stream.
- **R4 — Spreadsheet undo/redo (Phase 6.7) needs a CRDT-light cell model.** Today edits go straight to backend. Risk: introducing an in-memory edit stack while glide-data-grid emits its own events could double-fire. Mitigation: glide supports `onCellEdited` with explicit commit — defer backend write until commit, stack the pre-commit edit.
- **R5 — Native menu duplication.** Phase 3.4's "one registry feeds three surfaces" needs schema care: accelerator strings differ between Tauri's accelerator format (`"CmdOrCtrl+K"`) and xterm/CodeMirror keybinds. Mitigation: registry stores semantic action + Mac/Win/Linux variants; rendering layer adapts.
- **R6 — RESOLVED 2026-05-11**: TUI may keep German UI strings. CLAUDE.md §4 + AGENTS.md need an exception line; Phase 2.11 reduced to that doc update only.
- **R7 — Ordering.** Phase 1 (design system) is a hard prerequisite for everything visual. Phase 2 (a11y) can run partially in parallel. Phase 8 (AI UX) is the headline differentiator and should be sequenced before public Beta. Phases 5/6/7 can interleave depending on user appetite.
- **R8 — Test debt grows during the refactor.** Phase 11 should kick off in parallel with Phase 1, not wait until the end — otherwise three months of UI changes ship without regression coverage.
- **R9 — German→English voice rewrite (Phase 4) will read awkwardly in places.** "Locker" vs "Drive" vs "Vault" is genuinely contested — security-savvy users prefer "Vault". Mitigation: 3 testers see two variants A/B in onboarding step 2; decide based on confusion rate.

## Changelog

- 2026-05-11  created from 17-agent audit + 5 web research agents (Tauri 2 / design-system / WCAG 2.2 / Cursor+VS Code / AI workspace UX)
- 2026-05-11  Phase 2.11 done (CLAUDE.md §4 + AGENTS.md Language convention updated with TUI-German exception)
- 2026-05-11  Phase 0 done — all 14 quick-wins shipped (theme tokens 0.9/0.10/0.11/0.13, copy 0.1/0.5/0.12, a11y 0.2/0.3/0.6, tree 0.7/0.8, shortcuts 0.4, fuzzy 0.14). TypeScript clean. Status flipped to in_progress.
- 2026-05-11  Phase 1 foundation done — 1.1 Tailwind v4 + Vite plugin · 1.2 Radix primitives (10 packages) · 1.3 new 2026 token scales (spacing/type/colors/radius/elevation) all additive · 1.4 z-index stratification (14 numerics replaced) · 1.10 docs/design/tokens.md. Vite build: 3009 modules, CSS 108KB (gzip 17.7KB). 1.5–1.9 (UI primitive scaffold + component migrations) deferred to next turn.
- 2026-05-11  Phase 1.5 Tier 1 done — components/ui/{Button, IconButton, Tooltip, Dialog}.tsx + lib/cn.ts + barrel; clsx/tailwind-merge/class-variance-authority installed; @theme renamed `text` → `fg` to avoid `text-text` ugliness; TooltipProvider mounted in main.tsx. Build: 115KB CSS (gzip 19KB, +1.3KB net). Tier 2 (DropdownMenu/ContextMenu/Badge/FormField) + Tier 3 (Input/Switch/Checkbox/RadioGroup/Tabs) queued.
- 2026-05-11  Phase 1.5 Tier 2 done — components/ui/{DropdownMenu, ContextMenu, Badge, FormField}.tsx. Shared menu styling string-array kept in sync between DropdownMenu and ContextMenu (per-shadcn convention; intentional DRY-failing). Badge uses cva compound variants for 18 tone×variant cells. FormField uses render-prop pattern with useId for ARIA wiring. Build: 118KB CSS (gzip 19.6KB, +0.6KB), JS +7.6KB gzip (Radix menus).
- 2026-05-11  Phase 1.5 Tier 3 (final) done — components/ui/{Input, Textarea, Select, Switch, Checkbox, RadioGroup, Tabs}.tsx. Installed `@radix-ui/react-checkbox` (missed in Tier 1 batch). Phase 1.5 complete: **15 primitives** across 3 tiers in `components/ui/`. JS bundle main +9.4KB gzip total since Tier 1 (Radix primitives). All primitives reference CSS-var tokens; component migrations (Phase 1.6–1.9) unblocked.
- 2026-05-11  Phase 1.6 done — Settings.tsx fully migrated. ~700 lines net (added imports + JSX cleanup). All 11 tabs use the new primitives. Custom focus-trap dropped (Radix Dialog covers). Native `<select>` removed (Radix Select). Custom Toggle helper removed (Switch + FormField). Cross-platform consistency unlocked. Build: tsc clean, vite 11s, JS main +2.6KB gzip (Settings imports more primitives now).
- 2026-05-11  Phase 1.7 done — Onboarding + Unlock migrated. Both: dropped useFocusTrap, replaced custom inputs/buttons with Input/Button/Switch/Badge. Two non-migration bonuses shipped via the new primitives: **show/hide password toggle** (Phase 4.2 quick-win — uses Input.trailing slot) on Unlock + Onboarding passphrase fields; **friendly error mapping** (Phase 4.4 — `vault_corrupt`/`fs_*` errors → plain-English text) on Unlock. Both screens stay full-screen, not modals. Build: tsc + vite clean, JS main 4548KB gzip 1712KB (~stable).
- 2026-05-11  Phase 1.8 + 1.9 done — CommandPalette wrapped in Dialog (cmdk internals intact, useFocusTrap dropped); TreePane ContextMenu migrated to Radix (per-row trigger + portal content). Deleted superseded `components/ContextMenu.{tsx,css}` (90+60 LoC of dead code). Phase 1 is now COMPLETE (all 10 steps). Build: 4548KB gzip 1711KB.
- 2026-05-11  Phase 2 first batch (6/13 steps) done — 2.1 universal focus-visible (covers 13 ARIA roles), 2.2 reduced-motion sledgehammer, 2.3 24×24 hit-area on 5 legacy pills/buttons, 2.4 scroll-padding-top on MarkdownEditor (covers sticky toolbar), 2.9 Sonner WCAG 4.1.3 verified + containerAriaLabel set, 2.13 resolve_claude already extracted (rule note updated). Pending in Phase 2: 2.5 cmdk live-region patch, 2.6 Tiptap toolbar a11y wiring, 2.7 CodeMirror+xterm SR-mode toggle, 2.8 glide-data-grid aria, 2.10 axe-core in Playwright CI (needs Playwright setup), 2.12 TUI command handler tests. tsc + vite-build clean; TUI pytest 37/37 passing.
- 2026-05-11  Phase 2 second batch (3/13 more, 9/13 total) done — 2.5 CmdkResultAnnouncer (useCommandState → polite live region with "N results"), 2.6 Tiptap toolbar full ARIA toolbar pattern (roving tabindex + Alt+F10/Cmd+F10 to enter + Esc to exit + polite live for ⌘B/⌘I/⌘U announce + HeadingPicker keyboard nav), 2.8 SpreadsheetEditor region label + "Row N of M, column X, value Y" caret announcer. Remaining: 2.7 SR-mode Settings tab, 2.10 axe-core+Playwright, 2.12 TUI command handler tests (all bigger lifts). tsc + vite-build clean.
- 2026-05-11  Phase 3 first batch (6/12 steps) done — 3.1 trafficLightPosition centered in 40px TopBar, 3.2 window-state plugin verified already wired with StateFlags::ALL, 3.7+3.8 react-resizable-panels useDefaultLayout hook for per-shell layout persistence + library's built-in sash-double-click reset, 3.9 AppShell key prop verified pre-existing, 3.10 HelpCircle button in StatusBar (visible at every breakpoint, dispatches ⌘/), 3.12 LocalTrustPill Radix Popover in TopBar (Arc-pattern privacy callout linking into Settings → Privacy). Remaining: 3.3 DragRegion HOC, 3.4 native macOS menu, 3.5 window-vibrancy crate, 3.6 background updater banner, 3.11 Channel-based claude streaming. JS-side build: tsc + vite clean.
- 2026-05-11  Phase 4 first batch (4/9 steps done in this turn, plus 4.2+4.4 already from Phase 1.7) — 4.3 Caps-Lock detector on Unlock + Onboarding passphrase fields, 4.5 Back button + Step indicator in Onboarding (aria-live for step transitions), 4.9 trust callout in passphrase step (specific api.anthropic.com endpoint vs vague "no cloud"), 4.1 voice rewrite sweep: 12 user-facing "vault"/"Vault" surfaces (App.tsx eject toast + drive-ejected modal, Onboarding error, Settings tab label + body copy + Privacy bullets, CommandPalette group+item, ShortcutsOverlay shortcut label, StatusBar status pill + lock-button title, TopBar briefer) renamed to "drive lock" / "Lock drive" / "drive locked-unlocked". Code identifiers / IPC commands / vault.enc filename / docs/vault-decision.md refs kept. Remaining: 4.6 jobs-based first question (new step), 4.7 synthetic sample workspace (needs disk seeding), 4.8 membership-card moment (markdown gen). tsc + vite build clean.
