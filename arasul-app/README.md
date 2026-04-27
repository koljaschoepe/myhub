# arasul-app

The Arasul GUI — Tauri 2.x desktop shell that replaces the v3 Python TUI as Layer 5.

**Stack:** Tauri 2.10 · Rust 1.95 · React 19 · TypeScript 5.8 · Vite 7 · pnpm 10

**Reference docs:**
- [`../docs/arasul-plan.md`](../docs/arasul-plan.md) — strategic plan
- [`../docs/arasul-execution.md`](../docs/arasul-execution.md) — tactical step-by-step runbook
- [`../docs/arasul-design-spec.md`](../docs/arasul-design-spec.md) — UX/visual spec
- [`../docs/arasul-api-spec.md`](../docs/arasul-api-spec.md) — IPC surface

---

## Toolchain lives on the SSD

Arasul's zero-host-install principle applies to the dev toolchain:
- **Rust + Cargo + Tauri CLI:** installed on the SSD under `../runtime/rust/` by `../tooling/install-rust.sh`
- **Node + pnpm:** on your host (generic tools, shared with other work)

### Activate the SSD Rust toolchain in every new shell

```bash
source ../tooling/activate-rust.sh
```

This sets `RUSTUP_HOME`, `CARGO_HOME`, and prepends `$CARGO_HOME/bin` to `PATH`.
Nothing on your host is modified.

---

## Commands

All commands assume the SSD toolchain is activated.

```bash
pnpm install          # one-time; install node deps
pnpm tauri dev        # hot-reload dev mode — opens the Arasul window
pnpm tauri build      # production build → Arasul.app (+ dmg)
pnpm tauri build --debug   # faster debug build
cargo build --manifest-path src-tauri/Cargo.toml   # backend only, fastest smoke test
pnpm tauri info       # show config + detected toolchain
```

For non-mac targets (Windows, Linux), build in CI (Phase 5).

---

## Project layout (as of 2026-04-24)

```
arasul-app/
├── package.json              # pnpm project root
├── pnpm-lock.yaml
├── tsconfig.json
├── vite.config.ts
├── index.html
├── src/                      # React frontend
│   ├── main.tsx              # React root + Tauri API bootstrap
│   ├── App.tsx               # (future) three-pane shell
│   ├── App.css
│   ├── vite-env.d.ts
│   └── assets/
├── src-tauri/                # Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json       # product: Arasul, identifier: de.unit-ix.arasul, window 1280×800
│   ├── build.rs
│   ├── icons/
│   ├── capabilities/         # Tauri 2 permission system
│   └── src/
│       ├── main.rs           # Tauri entry
│       └── lib.rs            # app setup, command registration
├── public/
└── README.md                 # this file
```

Rust modules that will land in Phase 1 (per `arasul-api-spec.md`):
`pty.rs` · `fs.rs` · `claude.rs` · `registry.rs` · `vault.rs` · `drive.rs` · `launchd.rs` · `taskscheduler.rs` · `systemd.rs` · `ipc/`

---

## Conventions

- Every Rust `#[tauri::command]` MUST have a matching entry in `../docs/arasul-api-spec.md`.
- Every visible UI component MUST appear in `../docs/arasul-design-spec.md §4`.
- Use `cargo fmt` + `cargo clippy` on commit; `prettier` for TS.
- No `unsafe` Rust without a comment explaining why.

---

## First-time verification

Right after scaffolding (Phase 0 step 0.7):

```bash
source ../tooling/activate-rust.sh
pnpm install
pnpm tauri info            # should report tauri-cli 2.x, Rust 1.95+, react/vite detected
cargo build --manifest-path src-tauri/Cargo.toml   # first cold compile: ~3-5 min
```

If the Rust backend compiles cleanly and `pnpm tauri dev` opens a window with the
Tauri+React splash screen, Phase 0 step 0.7 is complete.
