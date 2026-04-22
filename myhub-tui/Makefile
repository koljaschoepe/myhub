# myhub-tui Makefile.
# Always builds a static arm64 Mach-O binary into the SSD's bin/ directory.
# Expects the SSD-local Go toolchain on PATH (the launcher arranges this;
# for ad-hoc builds, `export PATH="../tooling/go/bin:$PATH"` beforehand).

BIN_DIR := ../bin
BIN     := $(BIN_DIR)/myhub-tui
PKG     := ./cmd/myhub-tui
LDFLAGS := -s -w

.PHONY: all build run clean test fmt vet tidy

all: build

build:
	@mkdir -p $(BIN_DIR)
	@CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 \
	    go build -trimpath -ldflags="$(LDFLAGS)" -o $(BIN) $(PKG)
	@echo "✓ built $(BIN) ($$(du -h $(BIN) | cut -f1))"

run: build
	@$(BIN)

clean:
	rm -f $(BIN)

test:
	go test ./...

vet:
	go vet ./...

fmt:
	gofmt -w .

tidy:
	go mod tidy
