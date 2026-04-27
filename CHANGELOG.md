# Arasul — Changelog

All notable changes to the Arasul GUI application and its IPC surface are recorded here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · Versioning: [SemVer](https://semver.org/).

IPC is versioned independently of the app binary. IPC-breaking changes
require a MAJOR IPC bump and a migration note under the release entry.

---

## [Unreleased]

### Added

- Phase 0 step 0.6: Portable Rust toolchain under `runtime/rust/` on the SSD;
  `tooling/install-rust.sh` + `tooling/activate-rust.sh`.
- Phase 0 step 0.7: `arasul-app/` Tauri 2 scaffold (React 19 + TypeScript 5.8
  + Vite 7).
- Phase 0 step 0.8: Scaffold wired to Arasul conventions (product name,
  identifier `de.unit-ix.arasul`, window defaults, license, .gitignore).
- Phase 0 step 0.9: PTY hello-world — `src-tauri/src/pty.rs` with 4 commands
  (`pty_open`, `pty_write`, `pty_resize`, `pty_kill`); frontend renders a
  live xterm.js terminal in the Tauri window.
- Phase 0 step 0.10: Credential vault — `src-tauri/src/vault.rs` with 7
  commands (`vault_exists`, `vault_create`, `vault_unlock`, `vault_lock`,
  `vault_set_secret`, `vault_get_secret`, `vault_change_passphrase`). Pure-Rust
  crypto stack: Argon2id (OWASP 2025 params) + XChaCha20Poly1305 +
  `secrecy::SecretBox`. 7/7 unit tests passing. Decision rationale in
  `docs/vault-decision.md`.
- Phase 0 step 0.12: **IPC v1.0 frozen.** Every command from
  `docs/arasul-api-spec.md` now has a Rust signature placeholder under
  `arasul-app/src-tauri/src/ipc/` (platform, fs, projects, claude, git,
  system, auto_launch, updates). Unified `ArasulError` introduced at
  `ipc::error::ArasulError`, serialising to the `{ kind: "…", … }` shape
  from api-spec §0.
- Phase 0 step 0.14: Brand + TM docs delivered (`docs/brand-tm-check.md`,
  `docs/brand-migration-plan.md`) with status banners flagging
  Kolja-owned research items.

### Changed

- `docs/arasul-execution.md`: runbook format — steps 0.6-0.10, 0.12, 0.14
  checked off; running log appended.

---

## IPC versions

- **v1.0** (frozen 2026-04-24, Phase 0 Week 3 exit) — initial contract.
  Sections §1 Platform, §3 FS, §4 Projects, §5 Claude, §7 Git, §8 System,
  §9 Auto-launch, §10 Updates exist as stubs; §2 Vault and §6 PTY are
  fully implemented.

Breaking changes to IPC require a MAJOR bump (v2.0) and a row in this
section describing the migration.
