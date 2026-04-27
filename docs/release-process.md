# Arasul — Release Process

> The minimal version. No Apple Developer account, no code-signing cert, no CDN, no custom signing keys. Just GitHub.

## What the workflow does

```
git tag arasul-v0.1.0
git push origin arasul-v0.1.0
```

That tag triggers `.github/workflows/release-arasul.yml`, which:

1. Spins up four runners (macOS arm64, macOS x64, Ubuntu, Windows).
2. On each runner: `pnpm install` → `pnpm tauri build`.
3. Renames the built bundle to a stable name — `arasul-0.1.0-macos-arm64.dmg` etc.
4. Computes its SHA-256.
5. Uploads each bundle + its `.sha256` sidecar as a build artifact.
6. One final `publish` job downloads all four artifacts, composes a release body containing a `SHA256SUMS` block, and runs `gh release create` to publish the GitHub Release with the bundles attached.

That's it. The release shows up at `github.com/arasul/arasul/releases/tag/arasul-v0.1.0`. Users download directly from GitHub.

## What users see on first launch

- **macOS:** "Arasul cannot be opened because the developer cannot be verified." → right-click the app → Open → confirm once. Covered in `landing/support.html`.
- **Windows:** SmartScreen "Windows protected your PC." → More info → Run anyway. Covered in `landing/support.html`.
- **Linux:** `chmod +x Arasul-*.AppImage && ./Arasul-*.AppImage`.

Once the user has gone through that once per machine, auto-launch takes over (Settings → Auto-launch), and the OS remembers that it's trusted.

## How the app checks for updates

The app calls GitHub's public Releases API: `GET https://api.github.com/repos/arasul/arasul/releases/latest`. Unauthenticated quota is 60 req/hour/IP — the app checks once on launch, the user might launch the app 5× per day, so quota is a non-issue.

The API returns the tag name, the release body (which contains our `SHA256SUMS` block), and asset download URLs. `updates.rs` picks the asset matching the host OS+arch, downloads it, verifies the SHA-256, stages it under `.boot/updates/pending/<os>/` on the drive.

If the user is offline, `check_for_update` silently returns "no update available". No popup, no error.

## Distribution summary

| Concern | Our answer |
|---|---|
| Where do bundles live? | GitHub Releases (free, unlimited for public repos). |
| How does the updater find them? | `api.github.com/repos/arasul/arasul/releases/latest` (no auth, 60 req/hour). |
| Signing? | **None.** Users bypass Gatekeeper / SmartScreen on first launch. Supported long-term: add a donated code-sig cert if someone offers one. |
| CDN? | GitHub's own. No Cloudflare / Fastly account to manage. |
| Secrets required? | Just the default `GITHUB_TOKEN` that every Action has. Nothing to configure. |

## When to cut a release

As often as you feel like. The workflow is idempotent; a tag that already has a release will fail fast. Revert a broken release by deleting the tag + release and re-cutting with an incremented patch.
