---
name: arasul-app rules
paths:
  - "arasul-app/**/*.rs"
  - "arasul-app/**/*.ts"
  - "arasul-app/**/*.tsx"
  - "arasul-app/**/*.css"
  - "arasul-app/**/*.toml"
  - "arasul-app/**/*.json"
  - "arasul-app/README.md"
---

# arasul-app — Tauri 2 desktop app rules

Loaded only when editing files matching `paths:` above.

## Stack

- **Tauri 2.10+**, plugins: `window-state`, `opener`, `dialog`, `single-instance`
- **Rust 1.95+** (SSD-toolchain via `tooling/install-rust.sh` then `source tooling/activate-rust.sh`)
- **React 19 + TypeScript 5.8 + Vite 7**, package manager: **pnpm**
- **No component library.** Raw React + Lucide icons (16/20px). CodeMirror 6 (editor), Tiptap (MD toolbar), xterm.js v6 (terminal), Glide Data Grid (workbook).
- Locked design direction: **1A Linear-clean** (`docs/arasul-design-spec.md`).

Build:
```bash
cd arasul-app && pnpm install
pnpm tauri dev          # hot-reload
pnpm tauri build        # production bundle
cd src-tauri && cargo test
```

## Adding a Tauri command (the canonical pattern)

1. Add `#[tauri::command]` function in the topic-grouped module (`vault.rs`, `claude.rs`, `workflow.rs`, `fs.rs`, …). New top-level concern → new module.
   ```rust
   #[tauri::command]
   pub async fn my_command(
       app: AppHandle,
       state: State<'_, VaultState>,
       arg: String,
   ) -> Result<MyResponse, ArasulError> {
       // ... work ...
       Ok(MyResponse { ... })
   }
   ```
2. Register in `src-tauri/src/lib.rs` inside `tauri::generate_handler![…]`.
3. Document the IPC contract in `docs/arasul-api-spec.md` under the matching § section.
4. Inline test (`#[cfg(test)] mod tests`) for non-trivial logic; integration via the frontend.

Canonical examples:
- `src-tauri/src/vault.rs` — pattern with `State<VaultState>` + error mapping (vault is the gold standard, 7/7 tests).
- `src-tauri/src/claude.rs` — pattern with `AppHandle` + PTY spawn + event streaming.
- `src-tauri/src/workflow.rs` — pattern with SQLite persistence + thread::spawn for long ops.

## Frontend — adding a screen / pane

- Single-page Tauri app, no React Router. Top-level state in `App.tsx` decides which screen to render based on `SessionProvider` + `WorkspaceProvider` state.
- Screens live in `src/screens/` (`Unlock.tsx`, `Onboarding.tsx`, `Settings.tsx`, plus the dashboard via `ThreePaneShell`).
- Panes / overlays in `src/components/`.
- Shortcuts wired in `src/shortcuts/` and surfaced in `ShortcutsOverlay.tsx`.
- All Tauri calls go through `src/ipc.ts` wrappers (typed). Don't call `invoke()` directly from components.

## AI integration (subscription-only)

- Interactive Claude → `launch_claude()` spawns the official `claude` binary in a PTY (`portable-pty` Rust + `xterm.js` frontend).
- Headless calls → `claude -p` subprocess (e.g. `ask_briefer`).
- **Token rule:** `CLAUDE_CONFIG_DIR=$ARASUL_ROOT/.claude` is the ONLY auth wiring. Never harvest, persist, relay, or log the OAuth token. The `harvester thread` pattern that previously polled `<tmpdir>/.claude/claude.json` was removed in Phase 3.1 — do not re-introduce it.
- **Binary resolution:** `which("claude")` then `$ARASUL_ROOT/runtime/claude-*`. If missing, the frontend Onboarding step calls `claude_install` (Phase 4) which orchestrates Anthropic's `curl … | bash` installer. We do **not** bundle the binary.

**Never** add `anthropic-sdk` or `openai` crates to `Cargo.toml` for the default path. The `PreToolUse` hook blocks Edit/Write of files containing `use anthropic::`, `use openai::`, etc.

## Vault

`vault_with_secret`: argon2id (m=19MiB, t=2, p=1) + XChaCha20-Poly1305. Implementation in `src-tauri/src/vault.rs`. Decision locked in `docs/vault-decision.md`. Don't switch crypto without revisiting that doc.

## Provider abstraction (Phase 5)

Multi-provider AI lives in `src-tauri/src/providers/`:

- `mod.rs` — `Provider` trait, `ProviderRegistry`, `ProviderState`, shared `resolve_binary`/`try_version` helpers, public wire types (`Billing`, `Role`, `Capabilities`, `ProviderKind`, `AuthStatus`, `InstallCommand`, `ProviderSummary`).
- `install.rs` — generic shell-install runner (`spawn_install`) that streams stdout/stderr into a Tauri event channel and emits a final `{ done, ok, exit_code, resolved_path }`.
- `claude_code.rs`, `codex.rs`, `gemini.rs`, `cursor.rs`, `ollama.rs` — one zero-sized struct per vendor, implementing the trait.
- `commands.rs` — three Tauri commands: `provider_list`, `provider_auth_status`, `provider_install`.

Frontend lives in `src/components/ProviderPicker.tsx` (+ matching CSS).

**Adding a new provider:**

1. Create `src-tauri/src/providers/<vendor>.rs` with a unit struct implementing `Provider` (id, display_name, billing, kind, capabilities, auth_status, install_command).
2. Add `pub mod <vendor>;` to `providers/mod.rs`.
3. Append the struct to `ProviderRegistry::new()`.
4. No frontend code change needed — the `ProviderPicker` enumerates whatever the registry returns.

**Hard rules for adapters:**

- `auth_status()` must return in <500 ms. CLI providers do `resolve_binary` + optional `--version`. HTTP providers do a single short-timeout GET (Ollama uses 400 ms via ureq).
- `install_command()` must use the **vendor's official installer URL** (no mirrors, no Arasul-hosted scripts). Hardcode the exact one-liner Anthropic / OpenAI / Google / etc. document.
- Never pull in an SDK crate (`anthropic_sdk`, `openai_api_rust`, etc.). Subprocess only. The `PreToolUse` API-import block hook will refuse the file otherwise.
- Don't read, write, or proxy the vendor's auth tokens. Each CLI manages its own credentials in its own config dir.

## Workflow runner

YAML-defined workflows under `content/projects/<project>/workflows/*.yaml`. Step types in `src-tauri/src/workflow.rs`. SQLite-backed run history in `workflow_db.rs`.

When adding a step type:
1. Add variant to `StepDef` enum.
2. Add executor branch in the runner.
3. Update `arasul-api-spec.md` § 12.
4. Add a unit test in `workflow.rs::tests`.

`claude` step type uses `claude -p` subprocess (subscription-billed). Don't add a `claude_api` step type.

### Quota guards (Phase 6.3 + 6.2/6.4)

Two static guards run on every workflow:

- **Loop iteration cap** — `StepDef::Loop.max_iterations` defaults to `LOOP_DEFAULT_CAP=100`, hard-capped at `LOOP_HARD_CAP=10_000`. Runner refuses upfront if the `over` array exceeds the cap. Authors set `max_iterations: <n>` on the loop step to relax (within the hard cap).
- **Preflight log + budget warning** — on every run start, the runner emits log lines with the static estimate of claude-call count, input/output tokens, and Sonnet 4.5 USD cost. If the call count exceeds the workflow's `budget_warning_threshold` (top-level YAML field, default `BUDGET_WARNING_DEFAULT=10`), an additional ⚠ warning line is logged. No execution block — visibility, not friction.

Both guards live in `workflow.rs` next to the runner. When changing them, update the master plan changelog.

## Spec docs (read these when in doubt)

- `docs/arasul-plan.md` — 26-week phased roadmap (LOCKED 2026-04-24).
- `docs/arasul-design-spec.md` — visual + UX (LOCKED 2026-04-24).
- `docs/arasul-api-spec.md` — IPC contract (FROZEN 2026-04-26).
- `docs/arasul-execution.md` — phased runbook with checkboxes.
- `docs/vision-v3-ai-workspace.md` — post-Beta roadmap.

## Anti-patterns

- Don't add a component library (we ship raw React for bundle size + design control).
- Don't reach across modules in `src-tauri/` — keep concerns grouped by topic.
- Don't call `invoke()` directly from React components — go through `src/ipc.ts`.
- Don't introduce `Tokio` runtime dependencies in vault code (parking_lot Mutex is fine, async vault is out of scope).
