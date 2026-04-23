# myhub TUI — UX Overhaul Plan (ARCHIVED)

> ⚠️ **Archived 2026-04-23 — superseded by the v3 Python port.** The
> plan below was written for the v2 Go/Bubble-Tea TUI. Many of the
> specific file paths (`internal/ui/`, `internal/theme/`, `tea.Tick`,
> `dashboard.go`) no longer exist. The UX goals it argued for —
> responsive tiers, OpenAra-style dashboard, exec-launch, stats panel
> — are all shipped in the v3 Python TUI at `myhub-tui/myhub_tui/`.
> Keep for historical context only.

**Status:** draft, not yet implemented
**Author:** Claude (synthesis of 3 parallel sub-agent audits)
**Date:** 2026-04-23
**Scope:** `myhub-tui/internal/ui/`, `internal/theme/`, new `internal/stats/`
**Reference projects:** OpenAra (`~/Downloads/Jetson Nano SSH Server Setup/arasul_tui/`), Claude Code CLI, lazygit, k9s

---

## 1. Why

Kolja plugged the SSD in for the first time, saw the TUI boot, and hit three walls:

- **Navigation unclear:** `Enter` opens a detail-view, not Claude — contradicts muscle memory from every other launcher TUI.
- **No "new project" action:** projects only appear if you manually `mkdir content/projects/<name> && touch CLAUDE.md` from a shell. There is no in-TUI creation flow.
- **Screen feels empty:** one today-panel + one project list. No stats, no disk usage, no last-activity, nothing that signals "hub" rather than "launcher".

The TUI is a working MVP but the happy path does not exit the dashboard correctly and the dashboard carries too little information.

## 2. Design principles

1. **Enter = do the obvious thing.** For a project row: launch Claude in it. For a command-bar entry: execute it. Muscle memory wins.
2. **Every visible key is explained inline.** k9s-style contextual footer that changes per screen. No hidden keys.
3. **The dashboard is a status surface, not just a menu.** Free-space, counts, compile-freshness, trust-state are always visible.
4. **Responsive tiers.** Port OpenAra's `TIER_FULL / TIER_MEDIUM / TIER_COMPACT` — myhub currently captures `width/height` (`dashboard.go:294`) but never uses them.
5. **Reuse OpenAra.** Theme is already shared verbatim (`theme/theme.go` comment). Layout structure is the gap — port `arasul_tui/core/ui/dashboard.py` rendering 1:1 before inventing anything.

## 3. Target UX — ASCII mockups

### 3.1 Main screen (FULL tier, ≥78 cols)

```
    ▒▓█ M Y H U B █▓▒                                          v0.1.0-dev
    Guten Morgen, Kolja.                          Mac: MacBook-Pro ✓ trusted

    ╭─ status ─────────────────────────────────────────────────────────╮
    │  SSD       ▰▱▱▱▱▱▱▱▱▱   666 MiB / 1.8 TiB free                   │
    │  wiki      8 articles · compiled 11h ago                          │
    │  memory    1 entry · projects 0 · sessions 4970                   │
    │  uptime    00:04:12                                               │
    ╰───────────────────────────────────────────────────────────────────╯

    today
    > 2 PRs warten auf Review · Compile vor 11h fertig · Daniel ist scharf.

    projects
    → 1   myhub            main  ✓   2h ago       TUI overhaul incoming
      2   arasul-jet       dev   *   5d ago       Jetson build pipeline
      3   (leg ein neues mit 'n' an)

    [↑↓/jk] nav   [↵] open in claude   [n] new   [d] delete   [/] cmd
    [s] stats   [?] help   [q] quit
```

### 3.2 Project screen (after Enter on a row that is a directory, not "create new")

Should rarely be needed — `Enter` now goes straight to Claude. Detail-view becomes an **opt-in** `i` (info) key. See §5 P1 for the rationale.

### 3.3 Command bar (`/` or `:`)

```
    /
     /claude        launch claude in selected project
     /new           create new project (structured wizard)
     /compile       force wiki recompile
     /verify        run manifest verify
     /safe          toggle safe-mode
     /help          show all commands
```

Completion + descriptions mirror Claude Code's slash menu. No free-text shell access — every command is declared.

### 3.4 MEDIUM tier (60-77 cols)

Same layout, status-box collapses to 2 rows (SSD+counts on line 1, compile+uptime on line 2). Projects list drops the description column.

### 3.5 COMPACT tier (<60 cols)

Status-box disappears, only greeting + project list + footer. No ASCII logo.

## 4. Stats model

Always-show (refresh every 5 s via `tea.Tick`):

| Stat | Source | Cost |
|------|--------|------|
| Greeting + user name | `memory/config.toml` (cached at startup) | 0 ms |
| Trust badge | `ioreg` UUID vs `.claude/trusted-hosts.json` | <5 ms (once) |
| SSD free bytes | `unix.Statfs("/Volumes/myhub")` | <5 ms |
| Wiki article count | `WalkDir content/wiki *.md` | 15 ms |
| Memory entry count | `WalkDir memory *.md - MEMORY.md` | 18 ms |
| Project count | `len(registry.Projects)` (already in memory) | 0 ms |
| Last compile | `memory/compile-state.json` → `.last_compile` | <2 ms |
| Uptime | `time.Since(startTime)` | 0 ms |
| Claude-sessions count | `len(os.ReadDir(.claude/projects))` | <10 ms |

On-demand (`s` key opens full stats modal, computed with spinner + 30s cache):

| Stat | Source | Cost |
|------|--------|------|
| Git branch + dirty | `git status --porcelain` | 80-150 ms |
| Total SSD usage | `du -sh /Volumes/myhub` | 1+ s |
| Last file activity | `WalkDir + track max mtime` | 140 ms |
| Compiler running? | lockfile check (create `memory/.compile.lock`) | <2 ms |

All always-show stats live in a new `internal/stats/collector.go`. Keep it pure Go — no shelling out in the refresh loop.

## 5. Implementation phases

Phases are ordered so each one is independently shippable and testable. None of them require breaking changes to the manifest schema or launcher scripts.

### Phase 1 — Navigation fix (1-2h, pure `dashboard.go` work)

**Goal:** Kolja can plug in and immediately start Claude with one keystroke on the selected project.

Changes:
- `dashboard.go:428-431`: `Enter` on a project row → call `launch.Claude()` directly. Remove the detour via `ScreenProject`.
- `dashboard.go:443-449`: number keys `1-9` → same thing (launch, not navigate). OpenAra does this.
- Add `i` (info) for the old Detail-View — kept for reference but not on the happy path.
- Add `n` (new project) — opens Interview-primitive wizard (§Phase 4).
- Remove the stale `"lazygit launch not wired yet (phase 2)"` notice (`dashboard.go:439,466`) — hide the `g` key entirely until Phase 5 wires lazygit.
- Update `helpText()` (`dashboard.go:475`) to list the real binding set, including previously-hidden `Home/End/G`.

Acceptance: plug SSD → Daniel speaks → press `1` → Claude running in project. No intermediate screen.

### Phase 2 — Stats header (2-3h)

**Goal:** Dashboard feels like a hub, not a launcher.

New files:
- `internal/stats/collector.go` — `type Snapshot struct { Free, Used, Wiki, Memory, Projects, Sessions int; LastCompile time.Time; Uptime time.Duration; Trusted bool }` and a 5 s `Refresh()` loop driven by `tea.Tick`.
- `internal/theme/bar.go` — `BarString(pct float64, width int) string` with green<70, yellow≥70, red≥90 thresholds. Uses existing `GlyphBarFull/Empty`.

Changes:
- `dashboard.go`: add `stats Snapshot` field, wire `tea.Tick(5*time.Second)` in `Init()`, render the rounded-box status panel in `viewMain()` between greeting and today-panel.

Acceptance: header shows all 6 always-stats, updates live, <20 ms per refresh cycle.

### Phase 3 — Responsive tiers + OpenAra layout port (3-4h)

**Goal:** layout behaves sensibly at 40 / 60 / 80 / 120+ cols.

Port from `arasul_tui/core/ui/dashboard.py`:
- `_tier(width)` helper → returns `FULL|MEDIUM|COMPACT`.
- Conditional rendering in `viewMain()`:
  - FULL: logo + subtitle + status-box + today + projects + footer.
  - MEDIUM: compact status (2 rows), no logo subtitle.
  - COMPACT: greeting + project list + footer only.
- Left-pad via `content_pad()` equivalent in `theme.go` (we already have `LeftPad` but it's a fixed 4 spaces — make it tier-aware).

Acceptance: resize the terminal live, layout re-flows without broken characters. All three tiers screenshotted in `docs/screenshots/`.

### Phase 4 — Command bar + new-project wizard (3-4h)

**Goal:** discoverability solved the way Claude Code solves it.

New files:
- `internal/ui/cmdbar.go` — input-line model activated by `/` or `:`, Bubble Tea textinput with auto-complete.
- `internal/ui/wizards/newproject.go` — Interview-primitive flow: name → description → template (blank / copy CLAUDE.md from existing) → create dir + file + registry entry.

Changes:
- `dashboard.go`: route `/` and `:` keys to cmdbar, intercept all key events while cmdbar active.
- Register commands: `/claude`, `/new`, `/compile`, `/verify`, `/safe`, `/help`, `/stats`, `/quit`.
- Each command is a struct `{Name, Desc, Fn}` in a shared registry so help output stays in sync.

Acceptance: type `/new` → wizard runs → new project appears in list; type `/compile` → compile triggered; unknown command shows suggestion.

### Phase 5 — Stats modal + lazygit (2-3h)

**Goal:** on-demand expensive stats + the promised lazygit integration.

- `s` key opens full stats modal (spinner while expensive stats compute, 30 s cache).
- `g` key opens lazygit — finally wire the `tea.ExecProcess` path already scaffolded in `dashboard.go:439`. Launch `lazygit -p <projectPath>`; fall back to `git status` output in a scroll pane if lazygit binary not on PATH.

Acceptance: stats modal answers "wie voll ist die SSD wirklich" without blocking the dashboard; `g` opens lazygit in the selected project.

## 6. Out of scope (explicit)

- **New slash command syntax with spaces** — keep commands single-token for Phase 4; structured args come in a later phase.
- **Project deletion from TUI** — `d` in the mockup is forward-reserved. Phase 4 only adds `/new`, not `/delete`. Rationale: deletion needs a confirm wizard, better to get right later than rushed.
- **Cloud sync / remote dashboards** — myhub is local-only by design, confirmed with user.

## 7. Risks & rollback

- **Risk:** changing `Enter` behavior breaks muscle memory for anyone who already learned the current flow. → Mitigation: Kolja is the only user. Ship it.
- **Risk:** 5 s `tea.Tick` refresh noticeable as flicker. → Mitigation: only re-render stats box if snapshot actually changed (diff in collector).
- **Risk:** responsive tier rendering introduces off-by-one wraps in Bubble Tea's width calculations. → Mitigation: add `TestTierRendering` with golden-file assertions per tier.
- **Rollback:** each phase is a single feature branch. Revert = `git revert <phase-commit>`.

## 8. Sequencing recommendation

Ship **Phase 1 first, alone.** It is the smallest change that removes the worst friction point. Validate with Kolja on-device, then sequence 2 → 3 → 4 → 5.

Phases 2 and 3 can arguably run in parallel, but 3 depends on 2's stats struct for the MEDIUM tier's compact render — so serialize them.

Phase 4's command bar should not be started before Phase 1 ships, since it needs to share the keybinding dispatch logic cleanly.

## 9. Files to create / modify

| Path | Phase | Action |
|------|-------|--------|
| `myhub-tui/internal/ui/dashboard.go` | 1, 2, 3, 4 | edit |
| `myhub-tui/internal/ui/project.go` | 1 | edit (demote to info-only) |
| `myhub-tui/internal/ui/cmdbar.go` | 4 | new |
| `myhub-tui/internal/ui/wizards/newproject.go` | 4 | new |
| `myhub-tui/internal/stats/collector.go` | 2 | new |
| `myhub-tui/internal/theme/bar.go` | 2 | new |
| `myhub-tui/internal/theme/theme.go` | 3 | edit (tier-aware padding) |
| `myhub-tui/internal/launch/lazygit.go` | 5 | new |
| `docs/screenshots/full.png` etc | 3 | new (after manual capture) |
| `CHANGELOG.md` (or `VERSION` bump) | after each phase | edit |

Total estimate: 11-16 hours of focused work across 5 phases.
