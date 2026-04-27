---
name: tooling-and-boot rules
paths:
  - "tooling/**"
  - ".boot/**"
  - ".github/**"
  - "bin/**"
  - "Makefile"
---

# tooling / .boot / .github / bin — build, install, release rules

Loaded only when editing build/install/release/binary paths.

## SSD-portable principle

Everything must run from the SSD without installing into the host. Concretely:
- Runtimes (Python, Rust, Go, Node) live under `runtime/` or `tooling/`, bootstrapped by `tooling/install-*.sh`.
- Binaries live under `bin/`, populated by Releases or installer scripts.
- One ~1 KB launchd plist (`~/Library/LaunchAgents/com.myhub.mount.plist`) is the only host write, ever.

If a tooling change requires installing something into `~/.local/`, `/usr/local/`, or a host package manager, redesign it.

## Boot pipeline (in order)

1. `.boot/install.command` — one-time, double-clicked from Finder. Registers the launchd LaunchAgent and writes `~/.myhub-mount-wrapper.sh`.
2. `.boot/on-mount.sh` — fires on SSD mount via launchd. Runs the manifest check + sound + notification + preflight.
3. `.boot/preflight.sh` — health checks: `bin/claude` (or `which claude`), `.claude/`, `content/`, `memory/`, TUI launcher, Python runtime, root `CLAUDE.md`.
4. `.boot/launcher.sh` — final step. Sets `CLAUDE_CONFIG_DIR=$MYHUB/.claude`, `CLAUDE_CODE_PLUGIN_CACHE_DIR`, `PATH`. Runs the TUI with respawn loop. Falls back to `exec "$MYHUB/bin/claude"` if the TUI is missing.

When editing any of these, preserve: never block the GUI, log to `/tmp/`, exit promptly, idempotent.

## Build / release paths (no overlap)

- **Tauri multi-OS bundles** → `.github/workflows/release-arasul.yml`. Triggered by `arasul-v*.*.*` tags. 4-OS matrix: macOS-arm64, macOS-x64, Ubuntu-x64, Windows-x64. Unsigned (users see "unidentified developer" once).
- **Local Linux AppImage** → `tooling/build-appimage.sh`. For dev iteration.
- **Factory SSD imaging** → `tooling/image-ssd.sh` (single drive) and `tooling/factory-image-batch.sh` (batches). Both pull pre-built tarballs from GitHub Releases — they don't rebuild.
- **TUI lifecycle** → `bin/arasul-tui-pane` is the right-pane PTY entrypoint inside the Tauri GUI (respawn loop, per-project routing, fallback to bash).

If you find yourself adding a *fourth* build path: stop. Find which existing path covers it.

## `bin/claude` is special

The `claude` binary is **proprietary** (`anthropics/claude-code` LICENSE: "All rights reserved"). We do **not** bundle it. `bin/claude` is gitignored. If a user's SSD doesn't have it, the Onboarding step (Phase 4 of the master plan) orchestrates Anthropic's official `curl -fsSL https://claude.ai/install.sh | bash`.

The standalone TUI fallback (`launcher.sh`) detects missing `claude` and prints a one-liner install command rather than auto-running.

## Adding a tooling script

1. Make it idempotent (re-running must be safe).
2. POSIX `bash`, no `zsh`-isms (we run on Linux too in CI).
3. Honor `$ARASUL_ROOT` / `$MYHUB` env (root of the SSD).
4. Log to stderr, exit non-zero on failure, exit 0 on no-op.
5. Add a one-liner entry to `tooling/README.md`.

## landing/ (status: not deployed yet)

`landing/` is a 6-file static site (`index.html`, `privacy.html`, `signup.html`, `support.html`, plus `style.css` and `favicon.svg`). It's not wired into CI and not deployed yet — the public Beta launch (per `docs/launch-checklist.md`) will pick the host. Until then: leave it alone, don't add a `Deploy` GitHub Action, don't archive. If it's still un-deployed at Phase 7 of `docs/arasul-plan.md`, revisit.

## CI conventions

- `.github/workflows/` should never need network access beyond `apt-get`/`brew`/`pnpm`/`cargo`/`pypi`.
- No publishing to private CDNs. GitHub Releases is the only distribution channel.
- Workflows must build successfully on a fresh runner (no cached state assumptions).
- Don't add jobs that require Anthropic credentials in CI — we don't ship CI-driven Claude operations.

## Anti-patterns

- Don't write into the host filesystem from any tooling script (only `~/Library/LaunchAgents/com.myhub.mount.plist` is allowed, set by `install.command`).
- Don't add a "Telemetry" or "Crash report" path. Per `docs/vision/03-product-pillars.md`, this is forbidden.
- Don't commit `tooling/cache/`, `runtime/`, or `tooling/go-*` (gitignored).
