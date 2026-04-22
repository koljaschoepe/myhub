# tooling/

Build-time toolchains that live on the SSD. Not committed to git (too large);
bootstrapped on demand via `install-go.sh`.

## Why on the SSD and not on the host?

Core myhub principle: zero host footprint. The end-user running a pre-built
`bin/myhub-tui` never needs anything in here. Developers building from source
should also not have to install language toolchains on a host — they should
be able to plug in the SSD on any Mac and run `make build`.

So: the Go compiler travels with the drive. It's ~260 MB unpacked, well
worth it for the dev-ergonomics this gives us.

## Contents

```
tooling/
├── README.md            ← this file (committed)
├── install-go.sh        ← bootstrap script (committed; downloads + extracts)
├── go -> go-1.26.2/     ← symlink to the active version (not committed)
└── go-1.26.2/           ← the actual Go install (not committed)
    ├── bin/             ← go, gofmt live here
    ├── src/
    ├── pkg/
    └── ...
```

## Bootstrap on a fresh clone / new SSD

```
cd /Volumes/myhub
./tooling/install-go.sh
# verify:
./tooling/go/bin/go version   # → go version go1.26.2 darwin/arm64
```

The launcher (`./.boot/launcher.sh`) automatically prepends
`./tooling/go/bin` to `PATH`, so once Go is installed, `make build` inside
`myhub-tui/` picks it up without further setup.

## Update Go version

Edit `install-go.sh` to bump `GO_VERSION` + `GO_SHA256`, re-run it. The new
version installs alongside the old (`go-1.27.0/`), and the `go` symlink is
flipped to the new one. Old versions can be removed manually once the new
one is confirmed working.

## Release distribution

GitHub Releases bundle the extracted Go tree inside the myhub tarball. Fresh
users don't need to run `install-go.sh`; the tarball has everything.
