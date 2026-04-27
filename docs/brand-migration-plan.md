# OpenAra → Arasul Server — Brand Migration Plan

> **Status (2026-04-24):** plan complete, execution blocked on runbook 0.3 (GitHub org creation by Kolja).
> **Decided 2026-04-24:** unify the SSD product and the Linux-server sibling under one dach-brand, "Arasul."
>
> Execution order: (1) runbook step 0.3 creates `github.com/arasul` org, (2) this plan runs end-to-end in a single afternoon, (3) Phase 1 begins with new names everywhere.

---

## Scope

Two existing codebases affected:
- **This repo** (currently "myhub," at `/Users/koljaschope/Documents/ssd`). Becomes **Arasul** (the SSD / desktop product).
- **OpenAra repo** (sibling, at `~/Downloads/Jetson Nano SSH Server Setup/arasul_tui/` and on GitHub as `koljaschoepe/OpenAra` or similar). Becomes **Arasul Server** (the headless Linux sibling).

Both keep their codebases separate. Only branding, naming, and cross-references change.

---

## Decision: product-line names

| Line | Role | Target hardware | Repo |
|---|---|---|---|
| **Arasul** | Portable AI workspace, GUI | USB-C SSD + macOS/Windows/Linux host | `github.com/arasul/arasul` |
| **Arasul Server** | Headless AI hub (sibling) | ARM64 Linux (Jetson, RPi) | `github.com/arasul/server` |

Both share: palette, memory/wiki conventions, Interview primitive, command registry philosophy.

---

## This-repo rename checklist (in-order)

1. [ ] **GitHub org setup**
   - Create `github.com/arasul` org
   - Transfer or mirror this repo as `arasul/arasul`
   - Keep old URL as redirect (GitHub auto-redirects on transfer)

2. [ ] **Directory renames inside this repo**
   - `myhub-tui/` → `legacy/arasul-tui/` (mac-only expert mode, Python TUI)
   - `myhub-cli/` → `arasul-cli/` (Go maintenance CLI)
   - `bin/myhub` → `bin/arasul-cli-macos-arm64` (cross-compile rename happens in Phase 5)
   - `bin/myhub-tui` → `bin/arasul-tui` (Python launcher, mac-only)
   - `arasul-app/` already named correctly ✅

3. [ ] **File-content renames (grep-driven)**
   - `grep -r "myhub" .` — enumerate occurrences
   - Distinguish: user-facing copy, command names, env vars, script paths
   - Mechanical replaces: `myhub` → `arasul`, `MYHUB_ROOT` → `ARASUL_ROOT`, `com.myhub.*` → `de.unit-ix.arasul.*`
   - Do NOT rename: comments referencing v3 history ("the v3 TUI was named myhub"), URLs that still 301-redirect

4. [ ] **Config renames**
   - `.boot/plist.template` label → `de.unit-ix.arasul.mount`
   - `memory/projects.yaml` schema unchanged
   - `memory/config.toml` schema unchanged

5. [ ] **README.md + SPEC.md**
   - Rewrite top header + tagline
   - Add migration note: "Previously myhub; renamed 2026-04-24"
   - Cross-link to `github.com/arasul/server`

6. [ ] **Commit strategy**
   - Single monolithic commit: `rename: myhub → arasul (brand unification, #001)`
   - Retains `git log --follow` usability for file-level history

---

## OpenAra-repo rename checklist (coordinate with above)

1. [ ] **GitHub org transfer**
   - Transfer `koljaschoepe/OpenAra` → `arasul/server`
   - Update description: "Arasul Server — portable AI hub for ARM64 Linux (Jetson, Raspberry Pi). Sibling to github.com/arasul/arasul."

2. [ ] **Internal directory renames**
   - `arasul_tui/` directory — *keep the name* (it's already aligned) but rename the Python package to `arasul_server_tui` or similar to disambiguate from this repo's legacy `arasul-tui`.

3. [ ] **README.md**
   - Rename page header: "Arasul Server" (was "OpenAra")
   - Add sibling cross-link

4. [ ] **CLAUDE.md conventions**
   - Update to reference new brand names and repo URLs

---

## Public-facing comms

5. [ ] **Coordinate day-of announcement**
   - X/Twitter (if OpenAra has followers): "OpenAra is now Arasul Server. Joins a sibling product, Arasul (portable SSD workspace)."
   - Existing GitHub stargazers get notified automatically on transfer.
   - Update any existing documentation sites.

6. [ ] **Redirect strategy**
   - GitHub transfer creates automatic redirects from old URL — zero-config.
   - If either project had a custom domain (e.g., `openara.io`), keep it pointing to the renamed repo's page for 6 months.

---

## Timing

Execute the rename at the end of Phase 0 Week 1 (once `arasul.dev` DNS resolves and `github.com/arasul` is live). This minimizes the window where inconsistent branding exists in comm channels.

Do not start Phase 1 implementation until the rename is complete — every file touched in Phase 1 should use the new name.

---

## Rollback plan

If the rename is mid-execution and needs reverting:
- GitHub rename is reversible for 7 days via settings.
- In-repo sed replacements are captured in a single commit and revertable via `git revert`.
- Users still on `myhub` command names: add `bin/myhub` as a symlink to `bin/arasul-cli` for one release cycle.
