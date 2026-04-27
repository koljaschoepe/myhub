# myhub maintenance CLI Makefile.
#
# Builds one static arm64 Mach-O binary into the SSD's bin/ directory:
#   bin/myhub — maintenance CLI (compile, health, manifest, stats, trust, verify)
#
# (The interactive TUI is `myhub-tui` — a Python program in ../myhub-tui/,
# launched via the bash wrapper at ../bin/myhub-tui. The legacy Go TUI was
# retired in v3 when we ported the TUI to Python; Phase 7.1 of the
# 2026-04-26 master plan drops the dead build target here.)
#
# Expects the SSD-local Go toolchain on PATH (the launcher arranges this;
# for ad-hoc builds, `export PATH="../tooling/go/bin:$PATH"` beforehand).

BIN_DIR := ../bin
BIN_CLI := $(BIN_DIR)/myhub
PKG_CLI := ./cmd/myhub
LDFLAGS := -s -w
GOFLAGS := -trimpath -ldflags="$(LDFLAGS)"
GOENV   := CGO_ENABLED=0 GOOS=darwin GOARCH=arm64

.PHONY: all build run clean test fmt vet tidy

all: build

build:
	@mkdir -p $(BIN_DIR)
	@$(GOENV) go build $(GOFLAGS) -o $(BIN_CLI) $(PKG_CLI)
	@echo "✓ built $(BIN_CLI) ($$(du -h $(BIN_CLI) | cut -f1))"

run: build
	@$(BIN_CLI)

clean:
	rm -f $(BIN_CLI)

test:
	go test ./...

vet:
	go vet ./...

fmt:
	gofmt -w .

tidy:
	go mod tidy
