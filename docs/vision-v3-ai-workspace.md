# Arasul · Vision v3 — AI Artifact Studio

> **Date:** 2026-04-26
> **Status:** scope **locked 2026-04-26** by Kolja via Interview · sprint-1 kick-off pending
> **Companion to:** [`arasul-plan.md`](arasul-plan.md) (canonical product plan, 2026-04-24)
> **Builds on:** [`ultimate-polish-plan-v2.md`](ultimate-polish-plan-v2.md) (tactical polish, 2026-04-26)
> **Anchored in:** [`SPEC.md`](../SPEC.md) §§2, 8, 19 (design principles, knowledge architecture, non-goals)
> **Author:** synthesis of full-repo analysis (frontend audit, SPEC vision review, MarkdownEditor inspection, Cargo + npm dep maps, Tauri command inventory)

---

## 0. TL;DR

The polish plan brings Arasul to professional baseline. **This document defines what comes after**: turn Arasul from "AI-assisted notes" into an **AI-native artifact studio** — the place where students, researchers, consultants, and writers turn raw notes INTO finished deliverables (PDF reports, Excel models, multi-step pipelines) by composing AI-driven workflows that read content, talk to Claude, manipulate spreadsheets, and produce typeset PDFs — all without leaving the SSD.

Two new feature axes plus a polish slice, sequenced after the polish plan ships:

| Axis | Outcome | Effort | Phase |
|---|---|---|---|
| **A — Spreadsheet** | Open, edit, generate `.xlsx` and `.csv` natively in a Notion-grade grid; AI reads/writes cells; full formula support | 10–12 d | Phase 2 |
| **B — PDF viewer polish** *(scope-cut 2026-04-26)* | Existing `react-pdf` viewer gets zoom + in-doc search. **No generation, no Typst, no templates** in v1; revisit post-Beta on demand. | ~1 d | Phase 1 |
| **C — Workflow framework** | YAML workflows that chain AI calls, file ops, and spreadsheet ops with durable state in `memory/runs/` | 15–20 d | Phase 3 |

**Net new positioning:** "the brain on a drive that *makes things for you*."

---

## 1. Why now

Three things converge:

1. **The engine is sound.** Vault crypto (argon2id + chacha20poly1305), IPC v1.0 frozen (37 commands), atomic file writes, three-pane shell, drive watcher, PTY host — all shipped. This is not greenfield work; it's an additive layer.
2. **The polish plan closes the credibility gap.** After polish-plan-v2 (5–6 days), Arasul looks and feels like a Cursor-tier desktop product. That's the floor; vision-v3 is the ceiling.
3. **The differentiation gap remains.** Today, Arasul looks like "Notion + AI on a drive." Every PKM tool has chat-with-your-notes. **No one** has "compose a workflow that turns your raw notes into a 12-page typeset PDF report with embedded Excel charts, reproducibly, on a portable drive, offline-first." That is the wedge.

---

## 2. Vision lift — from notes app to artifact studio

### 2.1 The promise

> *"Plug in the SSD. Open the project. Type one prompt. Walk away. Come back to a finished PDF with the spreadsheet model, the data tables, and the prose summary, all already saved, citable, reproducible, and yours forever."*

### 2.2 The shift in mental model

|  | Today (post-polish) | Vision v3 |
|---|---|---|
| **Primary verb** | *write* | *produce* |
| **Primary artifact** | Markdown note | Project deliverable (PDF, .xlsx, multi-file bundle) |
| **AI role** | Conversational assistant | Workflow operator |
| **User skill required** | Markdown literacy | Workflow literacy (YAML → visual editor later) |
| **What ships from a session** | An updated note | A versioned artifact in `content/projects/<x>/exports/` |

### 2.3 Compatibility with SPEC.md non-goals

SPEC §19 forbids: cloud sync, replacement for PKM tools, multi-tenant SaaS, LLM router. **None of those are violated.** The new axes preserve every architectural pillar (SSD = source of truth, plain-text canonical, zero host footprint, single-Claude). See §11 (risks) for the harder constraints.

---

## 3. The three new axes — concrete tech picks

Both research agents that would have produced library recommendations hit the rate limit during the analysis, so the picks below are based on direct dep audit + general engineering judgment. Each is opinionated and reversible.

### 3.1 Axis A — Spreadsheet (Excel)

**Rust side (read + write + formulas):**
- **`calamine`** (~0.24) for reading `.xlsx`/`.xls`/`.ods`/`.csv` — pure Rust, fast, MIT, ~150 KB binary impact. Already battle-tested in many production tools.
- **`rust_xlsxwriter`** (~0.78) for writing `.xlsx` with formulas, formatting, charts. Pure Rust, MIT, sister of the venerable Python xlsxwriter. ~200 KB binary impact.
- **Why not `umya-spreadsheet`**: heavier, slower, occasional structured-XML edge-case bugs. Calamine + rust_xlsxwriter as a **read/write split** is cleaner.

**Frontend grid (interactive editing surface):**
- **Recommendation: `glide-data-grid`** (~700 KB gzip, MIT). Canvas-rendered (handles 100k rows without breaking a sweat), keyboard-first, paste-from-Excel works. Built by Glideapps for production no-code use. Exact fit for our use case.
- **Runner-up: `fortune-sheet`** (a Luckysheet fork). Has formula bar and Excel-fidelity rendering but ~3 MB and React 17 only — too heavy and version-mismatch with our React 19.
- **Skip**: `handsontable-community` (CC license restrictions on commercial use), `ag-grid-community` (less Excel-fidelity, heavier).

**Storage model — important decision:**
> Unlike PDF (which is *derived from* Markdown), `.xlsx` is **canonical for spreadsheet documents**. Treat `.xlsx` as a primary file type alongside `.md`. Adjacent CSV is auto-generated for grep/diff (`<sheet>.<sheetname>.csv`) so wiki + AI agents can still navigate by plain text per SPEC §2.2.

**New IPC commands** (Rust):
```
workbook_open(path) -> WorkbookHandle           # caches in Rust state
workbook_read_range(handle, sheet, range) -> CellGrid
workbook_write_cells(handle, sheet, edits[]) -> ()
workbook_save(handle) -> ()
workbook_close(handle) -> ()
workbook_list_sheets(handle) -> SheetMeta[]
workbook_eval_formula(handle, sheet, formula) -> CellValue
workbook_export_csv(handle, sheet) -> path     # adjacent .csv mirror
```

**Wire-up steps** (high-level, ~10–12 days):
1. Add `calamine` + `rust_xlsxwriter` to Cargo.toml + create `src-tauri/src/workbook.rs` with handle pool (parking_lot::Mutex<HashMap<Uuid, WorkbookSession>>)
2. Implement IPC commands; register in lib.rs
3. Add `glide-data-grid` to package.json
4. New component: `src/components/SpreadsheetEditor.tsx` — mirrors MarkdownEditor's autosave/path-binding pattern
5. EditorPane router: when `path.endsWith(".xlsx")` → `<SpreadsheetEditor>`; when `path.endsWith(".csv")` → either grid or text editor based on size
6. AI hook: `editor.activeRange` exposed to the workflow runtime so a workflow step can do `range.fill_with_claude({prompt: "..."})`
7. Tests: round-trip a 1000-row sheet through open → edit → save; format preservation check

### 3.2 Axis B — PDF viewer polish (scope-cut)

**Decision (2026-04-26):** PDF *generation* is **out of scope for v1.** Only the existing viewer gets polish. Revisit post-Beta if user demand surfaces.

**What stays in:** the bundled `react-pdf` viewer in `EditorPane.tsx:521+`. Two small polish items:
- **Zoom controls** (`-` / `=` / `0` / fit-width / fit-page) and persisted zoom-per-document.
- **In-document text search** (`⌘F` while a PDF is focused — wired to `pdfjs`'s search API; reuses the SearchPanel keybinding precedent).

**What stays out (deferred, may return in v1.1):**
- Markdown → PDF export pipeline
- Typst engine and the ~30 MB binary
- `content/_templates/` directory
- PDF templates (academic / business / letter)
- "Export as PDF" toolbar action
- Frontmatter-driven variables for templates

**Why deferred:** PDF generation is a real ~5–7 d investment plus a 30 MB-per-OS runtime. The user explicitly chose viewing-polish-only — generation can return as v1.1 once Beta data shows whether users actually want it (and what format: .pdf vs .docx vs HTML export). This also removes the entire `content/projects/<x>/exports/` storage layer from v1 (see §6).

**Effort:** ~1 day.

### 3.3 Axis C — Workflow framework

This is the largest piece and the truest vision lift. The principle from SPEC §2.3 (clean over clever) and §2.4 (adaptive, not prescriptive) drive the design — *no DAG editor in v1*, *no DSL*, just YAML + a sober runner.

**Definition format — `workflow.yaml` in `content/projects/<x>/workflows/`:**

```yaml
name: Monthly research report
description: Pulls notes from this project, asks Claude to synthesize, exports PDF.
schedule: optional cron-like; absent = on-demand
inputs:
  month: { type: month, default: previous }
steps:
  - id: gather
    type: file.read.glob
    pattern: notes/{{month}}/*.md
  - id: synthesize
    type: claude
    model: claude-opus-4-7
    prompt: |
      Summarize these {{gather.count}} research notes for {{month}}.
      Output: 1) 200-word executive summary, 2) 3-5 key findings, 3) data table (markdown).
    inputs: [gather]
  - id: parse_table
    type: markdown.extract_tables
    inputs: [synthesize]
  - id: write_xlsx
    type: workbook.from_markdown_table
    table: parse_table.tables[0]
    output: data/{{month}}-data.xlsx
  - id: write_summary
    type: file.write
    path: notes/{{month}}/digest.md
    content: |
      # Monthly research digest — {{month}}

      {{synthesize.text}}

      ## Source notes
      {{#each gather.files}}
      - [[{{this}}]]
      {{/each}}

      ## Data
      Generated spreadsheet: [[data/{{month}}-data.xlsx]]
```

**Step types** (v1 menu, all implemented in Rust):

| Type | Purpose |
|---|---|
| `claude` | Call Anthropic API via the existing vaulted token; supports streaming, tool use, structured output |
| `file.read` / `file.read.glob` | Read one or many files |
| `file.write` | Write/append a file |
| `markdown.extract_tables` / `markdown.extract_codeblocks` | Surgery on Claude's output |
| `workbook.read_range` / `workbook.write_cells` / `workbook.from_markdown_table` | Spreadsheet ops |
| `branch` / `switch` | Conditional |
| `loop` | Iterate over a collection |
| `prompt-user` | Pause; surface an Interview-primitive dialog; wait for human input |
| `shell` | Execute SSD-relative scripts (sandboxed; only paths under SSD root) |
| `web.fetch` | Optional, opt-in (breaks "offline-first" — flagged in UI) |

**Persistence — durability without ceremony:**
- SQLite at `memory/runs/runs.db` (one row per run, one row per step state)
- WAL mode for concurrent reads
- Each step's full input + output snapshotted to `memory/runs/<run_id>/<step_id>.json` so a workflow can be replayed deterministically
- Crash-safe: a killed run is `status=aborted`, user can `/workflow resume <id>`

**Execution model:**
- New Rust module `src-tauri/src/workflow.rs` with a tokio task runner
- Rust owns the lifecycle (start/pause/resume/cancel); frontend gets streaming progress events (`workflow://<run_id>/step` and `workflow://<run_id>/log`)
- Concurrency: at most one `claude` step at a time globally (rate-limit safety); other step types parallel where the DAG allows

**UI v1 — minimal, not visual:**
- New right-pane tab: "Workflows" (sits next to Terminal + future Chat per polish-plan-v2 §1.4)
- Workflow list (drawn from `content/projects/<x>/workflows/*.yaml`)
- Run modal: live step list, current status, abort button, log stream
- Editor: a code-mode CodeMirror with YAML syntax + JSON-schema-driven autocomplete (via `monaco-yaml`-style approach but in CM)

**UI v2 — visual editor (deferred to a later phase, ~10 days extra):**
- React Flow canvas rendering the YAML as a DAG
- Drag-drop node palette
- YAML stays the source of truth — visual is a view onto it

**First flagship workflow** (must ship with the framework as a demo):
- "Monthly research digest" — adapted from the example above (no PDF step in v1): gather → claude (synthesize) → xlsx (write data table) → markdown (write final summary). Demonstrates the full chain. The PDF render step returns when generation lands in v1.1.

**Effort:** ~15–20 days end-to-end (runner + step types + UI + flagship workflow + tests)

---

## 4. The Markdown editor — quality bar

Polish-plan-v2 already covers: blue-border fix, missing keyboard shortcuts (⌘B/I/U), error toasts. **Already applied in this session: blue-border fix is now stronger** — covers TipTap WYSIWYG, CodeMirror source mode (`cm-focused`), and the editor container, not just `.tiptap` (see edits to `MarkdownEditor.css:36-65` and `EditorPane.css:101-115`).

Beyond polish-plan-v2, vision-v3 adds:

### 4.1 Inline AI — `⌘K` Cursor-style

**Trigger:** select text → press `⌘K` → small inline prompt input appears beneath the selection. Type "make this more concise" → Enter → selection replaced with the AI's revision; user can `⌘Z` to undo or `⌘Enter` to accept.

**Wired via:**
- New TipTap extension `ai-edit` exposing a command `editor.commands.aiEdit({ prompt, scope: "selection" | "document" })`
- New IPC: `claude_inline_edit({ text, prompt, vault_handle }) -> stream_id`
- Streaming: backend emits chunks via `claude://<stream>/delta`, frontend applies them as a TipTap transaction so the user sees the rewrite happen live.

### 4.2 Slash menu — adds AI items

`MarkdownSlashMenu.tsx` already exists. Add four AI items:
- `/ai-summarize` — selects parent block, replaces with summary
- `/ai-expand` — opposite (bullet list → prose)
- `/ai-translate` — picks target language from sub-menu
- `/ai-tableize` — turns prose with comma-separated facts into a markdown table

### 4.3 Side-preview removed

`EditorPane.css` still has `.arasul-editor-preview` styles (for a side-by-side preview). With WYSIWYG TipTap as default, the side preview is redundant. Remove the rules and the corresponding feature flag — fewer surfaces to maintain. Source mode (CodeMirror) stays for power users.

### 4.4 Smart-typography touches (low-cost, high-delight)

- Auto em-dash on `--` (TipTap typography ext is already enabled — verify it's catching this; if not, custom regex paste handler)
- Smart quotes (already on)
- Auto-link on URL paste (already on via `Link.autolink: true`)
- Auto-format `# ` → heading **at start of line only** (the typography ext does this; verify cursor position)
- New: `[ ] ` → task list item (ProseMirror `inputrules`)

### 4.5 Word/char counter polishes

Polish-plan-v2 didn't touch the footstats. Vision-v3:
- Add **reading time estimate** (word count ÷ 250 wpm)
- Add **selection stats** (when text selected: "47 words selected")
- Position: still bottom-right, tertiary text color

---

## 5. Phase plan (sequenced)

| Phase | Name | Source | Days | Outcome |
|---|---|---|---|---|
| **0** | Polish floor | polish-plan-v2 §1–4 | 5–6 | App is professional, no data-loss risk, every promised shortcut wired |
| **1** | Editor delight + PDF viewer polish | this doc §4 + §3.2 | 4–5 | Smooth typing, ⌘K inline AI, AI slash items, removed side-preview, PDF zoom + search |
| **2** | Spreadsheet axis | this doc §3.1 | 10–12 | `.xlsx` open / edit / save / formula eval, AI cell ops |
| **3** | Workflow framework v1 | this doc §3.3 | 15–20 | YAML workflows, runner, persistence, flagship workflow demo, basic UI |
| **4** | Hardening + tests | implicit | 3–4 | Round-trip tests on the new surfaces, perf budget verified, CI green |
| **5** | Beta release | launch-checklist.md | 2 | Tagged release; SKU B installer; updated landing |
| **6+** | PDF generation, visual workflow editor, voice | deferred to v1.1 | TBD | Stretch — re-evaluated against Beta user signal |

**Total to v3-feature-complete: ~38 days of focused work** (down from ~45 after the PDF scope-cut). Realistic calendar: ~9 weeks at 4 productive days/week. Aligns with the arasul-plan.md Beta target (Q4 2026).

---

## 6. Storage layout — additions to SPEC §3.1

New canonical directories (slimmed after the PDF scope-cut):

```
content/
  projects/
    <slug>/
      workflows/                   # Per-project workflow definitions (NEW)
        monthly-digest.yaml
      # NOTE: no exports/ in v1. Spreadsheets generated by workflows
      #       land directly in the project's existing tree (e.g.
      #       <slug>/data/<filename>.xlsx) — same convention as any
      #       other authored file. Re-add a dedicated /exports/ dir
      #       only when PDF generation returns in v1.1.
memory/
  runs/                            # Workflow run logs (NEW)
    runs.db                        # SQLite, WAL mode
    <run_id>/
      step-<id>.json               # Each step's input/output snapshot
  workflows/                       # User's library of canned workflows (NEW)
    research-digest.yaml           # Cross-project workflows live here
```

**Removed from earlier draft** (consequence of the PDF scope-cut):
- `content/_templates/` — Typst templates not shipped in v1
- `runtime/typst/` — Typst binary not bundled
- `content/projects/<x>/exports/` — no rendered artifacts to segregate

All remaining additions consistent with SPEC.md filesystem layout principles — plain text where humanly possible, vault and binaries in their existing zones.

---

## 7. Vault + secrets — workflows need API access

Workflows that use the `claude` step need the Anthropic OAuth token. Today the token only flows into Claude Code's PTY env. New requirement:

- New IPC: `vault_with_secret(handle, key, callback)` — passes the secret into a Rust closure, never to JS. The workflow runner is in Rust, so it can use the token directly without the value ever crossing the IPC boundary.
- Same pattern works for future `web.fetch` steps with auth headers, or `github.api` steps using the existing GitHub PAT.

This is a small additive change to `vault.rs`, ~30 LOC. **Crucially: the JS frontend never sees the API key**, even when it triggers a workflow run.

---

## 8. AI cost model

Each workflow run costs API tokens. Vision-v3 needs a discipline around it:

- **Cost preview** before run start: dry-run the prompts, show estimated total tokens × current model pricing → display "≈ $0.42" before the user confirms.
- **Per-project budget** (optional): user can set a monthly cap; runs that would exceed it pause for confirmation.
- **Run history**: every completed run logs `tokens_in`, `tokens_out`, `model`, `cost_estimate` to the SQLite. Settings → Claude shows a 30-day chart.

Implementation lands in Phase 4 alongside the runner; deferring it adds product risk later.

---

## 9. Concrete dependency adds

For Cargo (`arasul-app/src-tauri/Cargo.toml`):
```toml
calamine = "0.24"                                          # xlsx read
rust_xlsxwriter = "0.78"                                   # xlsx write
pulldown-cmark = "0.10"                                    # markdown parsing for workflow steps
rusqlite = { version = "0.31", features = ["bundled"] }    # workflow persistence
tokio = { version = "1", features = ["rt-multi-thread", "fs", "macros", "sync"] }
reqwest = { version = "0.12", features = ["json", "stream", "rustls-tls"] }   # Anthropic API client
async-trait = "0.1"
```

For npm (`arasul-app/package.json`):
```json
"@glideapps/glide-data-grid": "^6.0.0"
```

**Removed after the PDF scope-cut:** Typst binary (~30 MB per OS); the `typst-as-lib` crate path is also off the table.

**Bundle size delta** (rough estimate, post-scope-cut):
- Rust: +5 MB compiled (mostly tokio + reqwest + rusqlite)
- Web: +700 KB gzipped
- Runtime: **+0 MB** (no Typst binary)
- **Total final SSD-portable bundle**: ~120 MB → ~125 MB. Well under the 200 MB cited in v4-gui-plan §1.1, with headroom restored for future additions.

---

## 10. Tests we'll add (Phase 5)

Currently per polish-plan-v2 §0: 0 frontend tests, modest Rust tests. Vision-v3 adds:

- **Workbook round-trip** (Rust): open fixture xlsx → edit cell → save → reopen → verify
- **Workflow runner** (Rust): YAML → run → assert all step outputs → resume after simulated crash
- **TipTap focus** (frontend, Playwright): click into editor → no blue border visible (snapshot test on every editor surface — TipTap, source-mode CodeMirror, plain text editor)
- **AI inline edit** (frontend, Playwright): mock Claude stream → verify selection replaced
- **PDF viewer** (frontend, Playwright): open fixture PDF → zoom in → search for a known string → matched range highlighted

Target: 60% line coverage on new Rust modules; integration smoke for every new IPC command.

---

## 11. Risks and what we'd do about them

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | Workflow durability on exFAT (atomic writes for SQLite WAL) | Medium | High | `F_FULLFSYNC` on macOS is already used for vault writes; reuse the same pattern for WAL checkpoints (see arasul-plan §2.1) |
| 2 | AI cost runaway in the workflow runner (e.g. infinite loop with `claude` step) | Medium | High | Hard cap: max 50 LLM calls per run; user-overridable; per-step timeout 5 min |
| 3 | Scope creep — "workflows that send email," "workflows that scrape websites" demands | High | Medium | Lock v1 step menu; web.fetch is opt-in; no email step in v1 (use OS share/mail integration outside the workflow) |
| 4 | Spreadsheet performance with 100k+ rows | Low | Medium | glide-data-grid is canvas-rendered; load only viewport rows; `workbook_read_range` paginates by sheet+range |
| 5 | Vision drift — Arasul becoming a no-code automation tool | Medium | Medium | Stay anchored in SPEC §19: workflows ARE Claude agents; no n8n-style visual graph in v1; the killer use case is *report generation*, not *automation* |
| 6 | "Where's PDF generation?" Beta-user feedback after launch | Medium | Low | Decision deferred consciously (§3.2). v1.1 plan exists in archive; trigger reopening when ≥ 30% of Beta users mention it. |

---

## 12. Out of scope (explicitly)

For this expansion (v1 of vision-v3):

- **PDF generation / Markdown→PDF export** — *scope-cut 2026-04-26*; viewer polish only. Reopen for v1.1.
- **Typst engine and PDF templates** — same.
- **Visual workflow editor** — YAML first; React Flow canvas in Phase 6+ once the YAML schema is stable.
- **Telemetry of any kind** — *locked 2026-04-26*: zero. No anonymous stats, no opt-in crash reports.
- **Real-time collaboration** on spreadsheets or workflows — single-user / single-drive.
- **Email / Slack / external integrations** — every external integration breaks "offline-first"; case-by-case via opt-in workflow steps later.
- **Mobile / iPad app** — out of scope (per SPEC §19).
- **Marketplace / sharing of workflows** — too early; revisit after 100 users have written workflows.
- **Speech-to-text / voice output** — Phase 6+ stretch.
- **Pricing change** — *locked 2026-04-26*: SKU-B stays at €29 for now; revisit after 100 Beta users with real conversion data.

---

## 13. Decisions locked (2026-04-26)

Answered via Interview before sprint kick-off. These are now treated as locks; reopen only with explicit reason.

| # | Decision | Lock |
|---|---|---|
| 1 | Spreadsheet UX scope | **Full editing + formulas** — `.xlsx` open/edit/save with formula evaluation, glide-data-grid frontend, AI can read & write cells. |
| 2 | PDF support scope | **Viewer polish only** — `react-pdf` viewer gets zoom + in-doc search. **No** generation, **no** Typst, **no** templates, **no** export. v1.1 reconsiders. |
| 3 | Workflow run persistence | **`memory/runs/` only** — SQLite + per-run snapshots, ephemeral by default. No "publish to project" in v1. |
| 4 | Inline AI auth model | **`vault_with_secret` in Rust** — Anthropic token never crosses to JS; new IPC executes Rust closure with secret in scope. |
| 5 | Telemetry | **Zero** — no crash reports, no anonymous stats, no opt-in. Reaffirms SPEC §19. |
| 6 | SKU-B pricing | **Defer** — stay at €29 for Beta; revisit after 100 Beta users with conversion data. |

---

## 14. Next-3-actions

1. **Done in this session:** stronger blue-border fix applied to `MarkdownEditor.css` (lines 36–65 area) and `EditorPane.css` (lines 101–115 area). Covers TipTap WYSIWYG, CodeMirror `cm-focused`, and the editor container — not just `.tiptap`. Verifiable on next dev launch.
2. **Done in this session:** all six §13 product decisions locked via Interview (2026-04-26). Phase plan re-sequenced (~38 d total, was ~45). Bundle delta down to ~5 MB after the PDF scope-cut.
3. **Sprint-1 kickoff (next):** Phase 0 = polish-plan-v2 §1–4 (5–6 d). After that gate clears, Phase 1 (editor delight + PDF viewer polish) with `⌘K` inline AI as the headline feature. Each phase exit-gate is a tagged release on `main`. Phase 2 (Spreadsheet axis, ~10–12 d) follows.

---

## 15. What this document is not

- Not an implementation manual. Each phase needs its own short execution doc when it kicks off (cf. the `arasul-execution.md` pattern).
- Not a contract beyond Phase 0. Phases 2–7 will surface design issues we can't predict from this distance.
- Not a replacement for `arasul-plan.md` — that remains the canonical product plan; vision-v3 is a feature-axis expansion that lives within it (it adds bullets to §3.4 and §6 of arasul-plan.md but doesn't rewrite them).

---

*End of vision-v3-ai-workspace.md.*
