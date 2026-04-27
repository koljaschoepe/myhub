# Arasul — IPC / API Specification

> **Status:** stub (frozen at Phase 0 Week 3 exit). Current version: draft.
> **Source of truth:** `src-tauri/src/ipc/` (once scaffolded).
> **Consumers:** `src/` TypeScript frontend.
> **Versioning:** semver; breaking changes require a MAJOR bump + migration note.

This document is the contract between the Rust backend and the React frontend of Arasul. Every IPC call the frontend makes MUST exist here. Every Rust-side `#[tauri::command]` MUST have an entry here.

---

## 0. Conventions

- All commands return `Result<T, ArasulError>` on the Rust side; on the TS side, rejected promises map to `ArasulError`.
- All commands are `async` unless explicitly marked synchronous.
- Event streams use Tauri's event channel: `backend emits "channel://{name}" → frontend listens`.
- Paths are always absolute and POSIX-style (`/Volumes/Arasul/content/...`). On Windows, the backend translates drive-letter paths to POSIX-style before returning to the frontend.
- All commands respect a per-session `SessionHandle` obtained from `vault_unlock` — frontend passes the handle on every call that touches credentials.

### ArasulError schema

```ts
type ArasulError =
  | { kind: "vault_locked" }
  | { kind: "vault_wrong_passphrase" }
  | { kind: "drive_disappeared" }
  | { kind: "fs_io", message: string }
  | { kind: "claude_launch", message: string }
  | { kind: "pty_closed", id: string }
  | { kind: "not_supported_on_os", os: "macos"|"windows"|"linux" }
  | { kind: "internal", message: string };
```

---

## 1. Platform introspection

### `get_platform()`

Returns the current OS and capabilities.

```ts
get_platform(): Promise<{
  os: "macos" | "windows" | "linux";
  arch: "arm64" | "x64";
  auto_launch_supported: boolean;
  auto_launch_installed: boolean;
  first_run: boolean;
  drive_mount_point: string;
  app_version: string;
}>
```

### `get_config()` / `set_config(patch)`

Read/merge-write of `memory/config.toml`. Never clobbers fields it doesn't know about.

---

## 2. Credential vault

State machine: `Absent` → (create) → `Locked` → (unlock) → `Unlocked` → (lock | timeout | quit) → `Locked`.

### `vault_exists()`

```ts
vault_exists(): Promise<boolean>
```

Returns true if `.boot/vault.enc` exists.

### `vault_create(passphrase)`

```ts
vault_create(passphrase: string): Promise<void>
```

First-run only. Fails if vault already exists. Derives key via argon2id (OWASP 2025 params), writes `.boot/kdf.salt`, creates empty encrypted vault at `.boot/vault.enc`.

### `vault_unlock(passphrase)`

```ts
vault_unlock(passphrase: string): Promise<SessionHandle>
```

Derives key, decrypts vault, holds plaintext in Rust-protected memory (`secrecy::SecretBox`), returns an opaque handle the frontend uses for subsequent calls. Handle expires on `vault_lock()` or process quit.

### `vault_lock()`

```ts
vault_lock(): Promise<void>
```

Zeros secrets in memory, invalidates handle.

### `vault_change_passphrase(old, new)`

Re-derives key, re-encrypts vault. Never leaves plaintext on disk.

### `vault_set_secret(handle, key, value)` / `vault_get_secret(handle, key)`

For Anthropic OAuth token, future GitHub PAT, etc. Internal to the app — the frontend should never directly call these except during onboarding.

---

## 3. Filesystem

All filesystem ops are constrained to the drive root; attempts to resolve paths outside `/Volumes/Arasul` return `ArasulError::fs_io`.

### `list_tree(path, options)`

```ts
list_tree(path: string, options?: { show_hidden?: boolean }): Promise<FilteredNode[]>

type FilteredNode = {
  name: string;
  path: string;
  kind: "file" | "dir";
  size_bytes?: number;
  mtime?: string;  // ISO-8601
  is_hidden: boolean;
  children?: FilteredNode[];   // only one level deep by default
};
```

Applies `.boot/tree-filter.json` unless `show_hidden: true`.

### `read_file(path)` / `write_file(path, content)`

```ts
read_file(path: string): Promise<string>
write_file(path: string, content: string): Promise<void>
```

Write uses atomic-rename: `tmp-XXXX.part → fsync → rename`. On macOS, uses `F_FULLFSYNC`.

### `rename(src, dst)` / `delete(path)` / `reveal_in_finder(path)`

Standard. `delete` moves to drive's `.Trashes/` rather than deleting (user recoverable).

---

## 4. Projects

### `list_projects()`

```ts
list_projects(): Promise<Project[]>

type Project = {
  slug: string;
  name: string;
  path: string;  // absolute
  created_at: string;
  last_opened_at?: string;
  claude_md_exists: boolean;
  git_repo: boolean;
};
```

Reads `memory/projects.yaml`.

### `create_project(args)` / `delete_project(slug)` / `resolve_project(query)`

`create_project` takes `{ name, description?, template? }`; wizard-driven on the frontend, atomic-write to projects.yaml, creates `content/projects/<slug>/` with a starter `CLAUDE.md`.

`resolve_project` does fuzzy/prefix matching — needed for command palette.

---

## 5. Claude launching

### `launch_claude(args)`

```ts
launch_claude(args: {
  project_slug: string;
  pane_id: string;      // xterm PTY id
  session_handle: SessionHandle;
}): Promise<void>
```

Reads OAuth token from vault (held in-memory), creates per-session host tmpdir at `$TMPDIR/arasul-{random}/`, writes `.claude/claude.json` with token inside tmpdir, sets `CLAUDE_CONFIG_DIR` env, spawns `bin/claude-{os}-{arch}` inside the PTY with `cwd = content/projects/<slug>`. Registers tmpdir for zeroize-on-quit.

### `ask_briefer(prompt)`

```ts
ask_briefer(prompt: string): Promise<string /* event channel name */>
```

Spawns `claude -p --agent briefer` headless, streams output via event channel `briefer://{session_id}/chunk`.

---

## 6. PTY

### `pty_open(args)`

```ts
pty_open(args: {
  cmd: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  cols: number;
  rows: number;
}): Promise<{ id: string }>
```

Opens a pseudoterminal via `portable-pty`, binds to an event channel `pty://{id}/data`.

### `pty_write(id, bytes)` / `pty_resize(id, cols, rows)` / `pty_kill(id)`

Standard. Bytes are base64-encoded on the wire.

### Events

- `pty://{id}/data` — bytes from the PTY to the frontend
- `pty://{id}/exit` — `{ code: number, signal?: string }`

---

## 7. Git

Thin wrappers over `git` subprocess; stream output via event channel.

### `git_status(project_slug)`

```ts
git_status(slug: string): Promise<{
  branch: string;
  ahead: number;
  behind: number;
  dirty_files: string[];
  untracked_files: string[];
}>
```

### `git_pull(slug)` / `git_push(slug)` / `git_log(slug, limit)`

Return event channels for streaming output.

---

## 8. System / maintenance

Delegates to `bin/arasul-cli-{os}-{arch}` (Go binary, cross-compiled).

### `compile(args)` / `verify()` / `stats()` / `health()`

```ts
compile(args?: { since?: string; full?: boolean; dry_run?: boolean }): Promise<string>
verify(): Promise<VerifyReport>
stats(): Promise<Stats>
health(): Promise<HealthReport>
```

---

## 9. Auto-launch

### `install_auto_launch()` / `uninstall_auto_launch()`

Per-OS implementation:
- macOS: writes `~/Library/LaunchAgents/de.unit-ix.arasul.plist`, runs `launchctl load`.
- Windows: PowerShell-subprocess registers a user Scheduled Task triggered by Kernel-PnP Event ID 20001, with volume-label filter.
- Linux: writes `~/.config/systemd/user/arasul-mount.path` + `arasul-mount.service`, runs `systemctl --user enable --now arasul-mount.path`.

### `is_auto_launch_installed()`

Synchronous, returns `boolean`.

---

## 10. Updates

### `check_for_update()`

```ts
check_for_update(): Promise<{
  current_version: string;
  latest_version: string;
  update_available: boolean;
  download_url?: string;
  signature_url?: string;
}>
```

Hits `https://arasul.dev/releases/feed.json` (Ed25519-signed). 2-second timeout. Silent on network failure.

### `download_and_stage_update()`

Downloads the new binary to `.boot/updates/pending/{os}/`, verifies Ed25519 signature, stages for next launch. Returns event channel for progress.

### `apply_pending_update()`

Called at next-launch-after-download. Atomic swap on mac/linux; deferred swap on Windows.

---

## 11. Open Questions (resolve by Phase 0 Week 3 freeze)

- Whether `vault_unlock` should support biometric unlock on macOS Touch ID / Windows Hello / Linux fprintd. v1.1 candidate; skipped for v1.
- Whether briefer streaming should go through a named event channel or via a Tauri state store. Probably channel.
- `reveal_in_finder` equivalents on Win (`explorer.exe /select,`) and Linux (`xdg-open` parent). Straightforward but needs wiring.
