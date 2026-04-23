# myhub-tui Makefile.
# Builds two static arm64 Mach-O binaries into the SSD's bin/ directory:
#   bin/myhub-tui — the interactive dashboard (Bubble Tea)
#   bin/myhub     — the maintenance CLI (subcommands: compile, health, ...)
# Expects the SSD-local Go toolchain on PATH (the launcher arranges this;
# for ad-hoc builds, `export PATH="../tooling/go/bin:$PATH"` beforehand).

BIN_DIR := ../bin
BIN_TUI := $(BIN_DIR)/myhub-tui
BIN_CLI := $(BIN_DIR)/myhub
PKG_TUI := ./cmd/myhub-tui
PKG_CLI := ./cmd/myhub
LDFLAGS := -s -w
GOFLAGS := -trimpath -ldflags="$(LDFLAGS)"
GOENV   := CGO_ENABLED=0 GOOS=darwin GOARCH=arm64

.PHONY: all build build-tui build-cli run clean test fmt vet tidy

all: build

build: build-tui build-cli

build-tui:
	@mkdir -p $(BIN_DIR)
	@$(GOENV) go build $(GOFLAGS) -o $(BIN_TUI) $(PKG_TUI)
	@echo "✓ built $(BIN_TUI) ($$(du -h $(BIN_TUI) | cut -f1))"

build-cli:
	@mkdir -p $(BIN_DIR)
	@$(GOENV) go build $(GOFLAGS) -o $(BIN_CLI) $(PKG_CLI)
	@echo "✓ built $(BIN_CLI) ($$(du -h $(BIN_CLI) | cut -f1))"

run: build-tui
	@$(BIN_TUI)

clean:
	rm -f $(BIN_TUI) $(BIN_CLI)

test:
	go test ./...

vet:
	go vet ./...

fmt:
	gofmt -w .

tidy:
	go mod tidy
