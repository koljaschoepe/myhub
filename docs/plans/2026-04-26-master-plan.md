---
name: master-plan
status: done
created: 2026-04-26
last_touched: 2026-04-27
owner: Kolja
related: [arasul-plan, vision-v3-ai-workspace, ultimate-polish-plan-v2]
---

## Goal

Optimize repo structure, context engineering, and AI integration so Arasul ships Beta on a clean foundation that uses the user's Claude Code subscription exclusively (no API costs leaked), supports Codex/Gemini/Cursor/Ollama as additional providers, and gives Claude Code the right context to add features consistently.

## Context

### Why now
- Pre-Beta. 18 docs accumulated, 3 superseded; no plan template; no root `CLAUDE.md`.
- One concrete legal risk: `arasul-app/src-tauri/src/claude.rs` polls `<tmpdir>/.claude/claude.json` and persists the OAuth token in the vault — this is the exact "harness" pattern Anthropic banned on 2026-04-04 (OpenClaw/OpenCode/Roo Code/Goose).
- One license risk: `bin/claude` (206 MB, "All rights reserved" per `LICENSE.md` of `anthropics/claude-code`) is staged on the SSD; we may not redistribute.
- Two parallel apps (`myhub-tui` Python + `arasul-app` Tauri) with diverging feature patterns and no shared bin-resolution helper.

### What we know (from 15-agent audit, 2026-04-26)
- **Subscription path is technically clean**: zero `import anthropic` / `import openai` anywhere. Every AI call is `claude` subprocess (`os.execvp` interactive or `claude -p` headless). User's subscription pays. No proxy.
- **Anthropic ToS posture**: Hosting the unmodified `claude` CLI in a PTY where the user does `claude login` themselves is **clearly allowed** — Anthropic's own VS Code extension is direct positive precedent. The hard line is token extraction + driving the subscription on the user's behalf.
- **Claude Agent SDK** is API-key only by policy — not viable for the default path.
- **Headless `claude -p`** uses subscription quota when `ANTHROPIC_API_KEY` is unset. Workflows can use it without API spend.
- **Karpathy LLM Wiki** under `content/` works; `compiler` agent runs incrementally; needs `wiki/index.md` + `wiki/log.md` to fully realize the pattern.
- **arasul-app**: ~80% of Phase 1 done. Vault production-grade (Argon2id + XChaCha20Poly1305, 7/7 tests). 65 Tauri commands across 12 spec sections. xterm.js + portable-pty wired.
- **myhub-tui**: 14 commands, consistent `CommandResult` pattern, 37 tests.

### What we are NOT doing
- **No MCP servers right now** (deferred — re-evaluate post-Beta if grep-through-wiki becomes a real pain point).
- **No bundling of `claude` binary** (license).
- **No Anthropic Sales escalation** (ToS posture is clear enough for the no-touch design).
- **No retiring of `myhub-tui`** — it stays as standalone SSH/headless mode and as the right-pane TUI inside Arasul.
- **No Claude Agent SDK** anywhere in default code paths.

---

## Phase 1 — Doc Foundation (this session)

- [x] 1.1 Create `docs/plans/` with this master plan as the first entry.
- [x] 1.2 Create `docs/vision/` with `01-mission.md`, `02-target-audience.md`, `03-product-pillars.md` (~30–60 lines each).
- [x] 1.3 Write root `/CLAUDE.md` (~50 lines): purpose, sub-project map, hard rules, pointers to vision/, plans/, AGENTS.md.
- [x] 1.4 Write root `/AGENTS.md` (Codex/Cursor/Jules-compatible portable summary). Root `CLAUDE.md` opens with `@AGENTS.md`.
- [x] 1.5 Create `docs/archive/` and move three superseded docs there: `ultimate-polish-plan.md` (replaced by v2), `v4-gui-plan.md` (replaced by `arasul-plan.md`), `ux-overhaul-plan.md` (referenced Go TUI v2, obsolete since v3).

## Phase 2 — Context Engineering (this session)

- [x] 2.1 Create `.claude/rules/` directory with five subsystem-scoped rules files. Each uses `paths:` frontmatter so it loads only when Claude touches matching files (lazy, monorepo-friendly):
  - [x] `myhub-tui.md` (paths: `myhub-tui/**/*.py`)
  - [x] `arasul-app.md` (paths: `arasul-app/**/*.{rs,ts,tsx,css}`)
  - [x] `content-wiki.md` (paths: `content/**`)
  - [x] `tooling.md` (paths: `tooling/**`, `.boot/**`, `.github/**`)
  - [x] `docs-and-plans.md` (paths: `docs/**`)
- [x] 2.2 Write `/plan` skill: `.claude/skills/plan/SKILL.md`. Triggered by `/plan` or auto when user says "let's make a plan for X". Uses `AskUserQuestion` to collect goal + scope + phases. Writes `docs/plans/YYYY-MM-DD-slug.md` from the canonical template.
- [x] 2.3 Write `/plan-progress` skill: `.claude/skills/plan-progress/SKILL.md`. Triggered when work on a plan completes. Updates checkboxes, bumps `last_touched`, appends Changelog entry, flips `status` if all checkboxes are checked.
- [x] 2.4 Add `PreToolUse` hook `block-api-imports.sh` to settings.json. Blocks `Edit`/`Write` of any file containing `import anthropic`, `from anthropic`, `import openai`, `from openai`, `@anthropic-ai/sdk`, `@anthropic-ai/anthropic`. Allowlist override: file must contain marker comment `// arasul:allow-api-sdk` justifying use.

## Phase 3 — Critical Code Fixes (this session)

- [x] 3.1 Patch `arasul-app/src-tauri/src/claude.rs`: remove the harvester thread that polls `<tmpdir>/.claude/claude.json` and writes `vault.set("anthropic_claude_json", ...)`. Replace with: spawn `claude` directly with `CLAUDE_CONFIG_DIR=$ARASUL_ROOT/.claude` so the official CLI manages tokens itself. Drop the vault key.
- [x] 3.2 Add to `.gitignore`: `.claude/cache/`, `.claude/file-history/`, `.claude/history.jsonl`, `.claude/mcp-needs-auth-cache.json`, `.claude/plugins/`, `.claude/policy-limits.json`, `.claude/scheduled_tasks.lock`, `.claude/sessions/`, `.claude/output-styles/`, `.claude/projects/`, `.claude/session-env/`, `.claude/shell-snapshots/`. (`bin/claude` and `arasul-app/node_modules/` are already excluded.)

## Phase 4 — Onboarding Auto-Install for `claude`

- [x] 4.1 Add `arasul-app` Tauri command `claude_install_status() -> { installed: bool, version: Option<String>, path: Option<String> }`. Resolves via `which claude` then `~/.local/bin/claude`, `/usr/local/bin/claude`, `/opt/homebrew/bin/claude`. — done 2026-04-27
- [x] 4.2 Add Tauri command `claude_install() -> stream` that spawns Anthropic's official installer (`curl -fsSL https://claude.ai/install.sh | bash` on POSIX, `irm https://claude.ai/install.ps1 | iex` on Windows) and streams stdout+stderr via Tauri events. Re-resolves install location on completion. — done 2026-04-27
- [x] 4.3 Add an Onboarding step "Connect Claude" in `arasul-app/src/screens/Onboarding.tsx`. Probes status on mount, shows install button + skip, streams install log into a `<pre>`, advances on success or skip. — done 2026-04-27
- [x] 4.4 Update `.boot/launcher.sh` to add `~/.local/bin` to PATH, add `resolve_claude` helper that finds `claude` in standard install locations, and update `fallback_to_claude` to print Anthropic's install one-liners (POSIX + PowerShell) and exit cleanly when `claude` is genuinely absent. — done 2026-04-27
- [x] 4.5 Onboarding copy: explicit "✨ No data leaves your device through Arasul. Your own Claude Pro or Max subscription is used directly — no API keys, no proxy, no Arasul cloud." in the Connect Claude step. — done 2026-04-27

## Phase 5 — Multi-Provider Trait + Day-1 CLIs

- [x] 5.1 Created `arasul-app/src-tauri/src/providers/mod.rs` with `Provider` trait, `ProviderKind::CliSidecar { binary }` / `ProviderKind::HttpApi { base_url }`, `Capabilities` (streaming/tools/vision/embeddings/roles), `Role` (Chat/Edit/Apply/Autocomplete/Embed/Rerank), `Billing` (Subscription/Api/Local), `AuthStatus` enum, `InstallCommand`, `ProviderRegistry` + `ProviderState`. Shared `resolve_binary` / `try_version` helpers. — done 2026-04-27
- [x] 5.2 `providers/claude_code.rs` — CliSidecar `claude`, Subscription, full capabilities. — done 2026-04-27
- [x] 5.3 `providers/codex.rs` — CliSidecar `codex`, Subscription (ChatGPT Plus/Pro/etc), npm install. — done 2026-04-27
- [x] 5.4 `providers/gemini.rs` — CliSidecar `gemini`, Subscription (Code Assist free tier), npm install. — done 2026-04-27
- [x] 5.5 `providers/cursor.rs` — CliSidecar `cursor-agent`, Subscription, curl install (POSIX only; Windows via desktop app). — done 2026-04-27
- [x] 5.6 `providers/ollama.rs` — HttpApi `localhost:11434`, Local, HTTP probe via `ureq` with 400 ms timeout. — done 2026-04-27
- [x] 5.7 Frontend `src/components/ProviderPicker.tsx` (+ CSS) — lists all providers with status + install controls + log streaming. Skipped: per-role default assignments and "Add provider" wizard (deferred to Phase 5.next; the 5 providers are baked into the registry, no runtime add needed). — done 2026-04-27
- [x] 5.8 `provider_install` Tauri command in `providers/commands.rs` — generalizes Phase 4's claude install pattern via `providers/install.rs::spawn_install`. Same event-channel shape (`{ delta, done, ok, exit_code, resolved_path, provider_id }`). — done 2026-04-27
- [ ] 5.9 Borrow [Models.dev](https://models.dev) JSON catalog for the model dropdown so we don't maintain a model list by hand. (Deferred — needs streaming-chat per provider first to be useful.)
- [ ] 5.next Per-role default assignments + "Add custom provider" wizard for OpenAI-compatible HTTP endpoints with a user-supplied API key. Lives in vault under `provider_<id>_api_key`.
- [ ] 5.next Wire `<ProviderPicker>` into the Settings screen and into the chat surface header.
- [ ] 5.next Streaming-chat trait method per provider (Claude already has `launch_claude` PTY; the others need headless `-p`/`exec`/`--print` adapters that share a streaming event-channel shape with `claude::ask_briefer`).

## Phase 6 — Workflow Hardening

- [x] 6.1 Shared bin-resolution. Rust: deleted `claude.rs::resolve_claude_anywhere` and the duplicated `which()` private fn; both call sites now use `crate::providers::resolve_binary("claude")`. Python: created `myhub-tui/myhub_tui/core/bin_resolve.py` with generic `resolve_binary(name, ssd_root)` + `resolve_claude(ssd_root)`; `commands/ai.py` and `commands/brief.py` import it (deleted their per-file `_resolve_claude` duplicates). — done 2026-04-27
- [x] 6.2 + 6.4 (merged) Workflow preflight log + budget warning. New `WorkflowDef.budget_warning_threshold: Option<usize>` YAML field (default `BUDGET_WARNING_DEFAULT=10`). New pure functions `preflight_walk(steps)` (counts claude calls, multiplies loop bodies by their effective `max_iterations`, sums branches) and `preflight_log_lines(def)` (emits the 4-line preflight block). Runner folds preflight lines into the initial log so the UI shows them before execution starts. Cost estimate uses Sonnet 4.5 list rates ($3/M input, $15/M output) with `chars/4` token heuristic and 500-token assumed output per call. 6 unit tests covering top-level claude steps, loop multiplication, default-cap fallback, threshold warning, silent-below-threshold, offline-only workflows, custom threshold. — done 2026-04-27
- [x] 6.3 Add `max_iterations` field to `loop` step. `LOOP_DEFAULT_CAP=100`, `LOOP_HARD_CAP=10_000`. Runner refuses upfront if `over` array exceeds cap, with explicit error. — done 2026-04-27
- [ ] 6.5 Add E2E workflow test that mocks `claude` subprocess and verifies hello-claude.yaml runs end-to-end. (Deferred — substantial enough for its own iteration; the 6.2 unit tests cover the static estimator.)

## Phase 7 — Repo Cleanup

- [x] 7.1 Drop `build-tui` target from `myhub-cli/Makefile` (the `cmd/myhub-tui/` dir was already gone — only the Makefile still referenced it). — done 2026-04-27
- [x] 7.2 Documented the distinction in `content/CLAUDE.md` (added `memory/` to the top-level categories list with explicit "Do not confuse with /memory/" warning) AND in root `/CLAUDE.md` (added "Two `memory/` dirs (intentional)" bullet to "Where context lives"). Verified: `/memory/compile-state.json` (45B) is `bin/myhub compile` state; `/content/memory/compile-state.json` (205B) is the Karpathy wiki compiler's `last_compile` state. Two pipelines, two state dirs — coexistence is correct, not a bug. — done 2026-04-27
- [x] 7.3 Fleshed out `content/projects/thesis/CLAUDE.md` with status, target structure, conventions, when-Claude-is-launched-here rules, and Done definition. Stub-replacement note: if still inactive in a month, delete via TUI `/delete`. — done 2026-04-27
- [x] 7.4 Decision: leave `landing/` alone for now. Not deployed, not archived. The public Beta launch (per `docs/launch-checklist.md`) will pick the host. Documented in `.claude/rules/tooling.md` so future Claude sessions know the status. Revisit if still un-deployed at Phase 7 of arasul-plan. — done 2026-04-27

## Phase 8 — Documentation Polish

- [x] 8.1 Updated `content/CLAUDE.md` — opening paragraph now points at `/CLAUDE.md`, `/AGENTS.md`, `docs/vision/`, `docs/plans/`, and `.claude/rules/<subsystem>.md` (lazy-loaded). Added `memory/` to the top-level category list. SSD-root cross-reference list rewritten: now lists `/CLAUDE.md`, `.claude/rules/`, `docs/vision/`, `docs/plans/`, `docs/archive/`, and notes that `bin/claude` is no longer bundled (Phase 4). — done 2026-04-27
- [x] 8.2 **Decision: skip.** `.claude/rules/docs-and-plans.md` already loads automatically (via `paths: ["docs/**"]` frontmatter) when Claude touches anything under `docs/`. Adding a parallel `docs/CLAUDE.md` would duplicate ~15 lines and violate the "would removing this confuse a reader?" anti-bloat test. The rule file is the single source of truth for docs/-conventions. — done 2026-04-27
- [x] 8.3 Created `content/wiki/index.md` (catalog of compiled articles, organized by category) and `content/wiki/log.md` (append-only ingest log with documented entry format). Compiler agent will append from here on. — done 2026-04-27
- [x] 8.4 **Recommended cadence**: every 30 days, run `/loop 30d "audit CLAUDE.md sizes (run /memory or wc -l on every CLAUDE.md and rule file). Apply the anti-bloat test: would removing each line cause Claude to make a mistake? If not, prune. Convert chronically-violated rules to PreToolUse hooks; demote chronically-unused rules to skills or delete."` Not auto-scheduled (creates a remote agent on the user's account; user-triggered action). — done 2026-04-27

---

## Risks & Open Questions

- **R1: Anthropic could expand the "harness" definition.** Current ToS guidance protects "host the official CLI, user logs in themselves, no token touching, no auto-piloting." Phase 3.1 + Phase 4 implement this. Mitigation: explicit UI disclosure ("✨ Your Claude subscription is used directly"), no User-Agent spoofing, no proxy/cache/relay.
- **R2: macOS Dock-launch + Keychain unlock.** When Arasul is launched from Finder/Dock (not a logged-in shell), the user's login keychain may be locked from the daemon's view (Claude Code issue [#9403](https://github.com/anthropics/claude-code/issues/9403)). Mitigation: detect `claude` auth-failure on first PTY spawn, prompt user to run `claude setup-token` and paste the resulting `CLAUDE_CODE_OAUTH_TOKEN` (one-time, stored in vault as `claude_oauth_override`).
- **R3: Phase 5 multi-provider scope is large.** All 4 CLIs Day-1 + Ollama is ~6 Tauri-command modules. Mitigation: ship Phase 5.1+5.2 (trait + Claude only) first, gate the Provider Picker behind a "More providers (beta)" toggle until 5.3–5.6 land.
- **R4: PreToolUse hook may be noisy.** Blocking `import anthropic` could trip on third-party code reads. Mitigation: only fire on `Edit`/`Write` (not `Read`), not on `arasul-app/node_modules/**` or `.claude/plugins/**`. Allowlist marker comment for legitimate API use.
- **R5: Workflow cost-preview accuracy.** `claude -p --dry-run` may not exist; static heuristic could be wrong by ±2×. Acceptable at v1 — we just need order-of-magnitude warnings.

## Changelog

- 2026-04-26  created (15-agent repo audit + ToS research + multi-provider research; 4-question + 3-question Round-2 interview).
- 2026-04-26  Phase 1.1–1.5 done.
- 2026-04-26  Phase 2.1–2.4 done.
- 2026-04-26  Phase 3.1–3.2 done.
- 2026-04-27  Phase 4.1–4.5 done (claude_install_status + claude_install Tauri commands, Onboarding "Connect Claude" step with streaming install log, launcher.sh detects missing claude and prints official install one-liners).
- 2026-04-27  Phase 6.3 done (loop max_iterations cap with LOOP_DEFAULT_CAP=100, LOOP_HARD_CAP=10_000).
- 2026-04-27  Phase 7.1 done (Makefile dead build-tui target removed).
- 2026-04-27  Phase 7.3 done (thesis CLAUDE.md fleshed out).
- 2026-04-27  Phase 8.3 done (wiki/index.md + log.md initialized per Karpathy pattern).
- 2026-04-27  Phase 5.1–5.8 done. `providers/` module + 5 adapters (Claude Code, Codex, Gemini, Cursor, Ollama) + 3 Tauri commands + `<ProviderPicker>` React component. Generalised install runner in `providers/install.rs`. `.claude/rules/arasul-app.md` updated with the "Adding a new provider" recipe. 5.9 (Models.dev catalog) deferred until streaming-chat per provider lands.
- 2026-04-27  Phase 6.1 done. Shared `resolve_binary` lives in `providers/mod.rs` (Rust) and `myhub-tui/myhub_tui/core/bin_resolve.py` (Python). `claude.rs` cleanup: dropped `which()` and `resolve_claude_anywhere()` duplicates. `ai.py` + `brief.py` import the shared resolver.
- 2026-04-27  Phase 6.2 + 6.4 done. Workflow preflight: `WorkflowDef.budget_warning_threshold` YAML field, `preflight_walk` + `preflight_log_lines` helpers, runner folds preflight into initial log, 6 unit tests. Cost heuristic: Sonnet 4.5 rates, chars/4 tokenizer, 500 output tokens per call.
- 2026-04-27  Phase 6.5 explicitly deferred — needs E2E test fixtures + mock `claude` subprocess; bigger than the static checks already in 6.2.
- 2026-04-27  Phase 7.2 done. Both `memory/` dirs documented in `content/CLAUDE.md` + root `/CLAUDE.md`. Confirmed not a bug: two distinct pipelines (host/TUI state vs Karpathy wiki-compiler state).
- 2026-04-27  Phase 7.4 done. `landing/` left in place; status noted in `.claude/rules/tooling.md`. Deploy decision deferred to public-Beta launch per `docs/launch-checklist.md`.
- 2026-04-27  Phase 8.1 done. `content/CLAUDE.md` rewritten to point at root `/CLAUDE.md`, `/AGENTS.md`, `docs/vision/`, `docs/plans/`, `.claude/rules/<subsystem>.md` (lazy load).
- 2026-04-27  Phase 8.2 skipped on purpose. `.claude/rules/docs-and-plans.md` (auto-loaded via `paths: docs/**`) is the single source of truth for docs-conventions; a parallel `docs/CLAUDE.md` would duplicate it.
- 2026-04-27  Phase 8.4 documented. `/loop 30d` recommendation captured in the plan; not auto-scheduled (user-triggered action).
- 2026-04-27  status flipped to **done** — every phase that's getting done in this plan is done. Remaining open items (5.next per-role assignments, 5.next streaming-chat trait method, 5.next ProviderPicker wiring into Settings/Chat, 5.9 Models.dev catalog, 6.5 E2E workflow test) are listed as 5.next/6.5 follow-ups; spawn fresh plans under `docs/plans/` for each as they get scheduled.
