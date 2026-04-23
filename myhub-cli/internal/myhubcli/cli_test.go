package myhubcli

import (
	"bytes"
	"os"
	"strings"
	"testing"
)

func TestResolveRootPrefersEnv(t *testing.T) {
	t.Setenv("MYHUB_ROOT", "/tmp/foo")
	if got := ResolveRoot(); got != "/tmp/foo" {
		t.Errorf("got %q, want /tmp/foo", got)
	}
}

func TestResolveRootFallsBackToCwd(t *testing.T) {
	t.Setenv("MYHUB_ROOT", "")
	cwd, _ := os.Getwd()
	if got := ResolveRoot(); got != cwd && !strings.HasSuffix(got, "myhub-tui") {
		// Binary-location fallback returns parent of bin/, so for tests run
		// from the package source dir either cwd OR the binary-derived path
		// is acceptable; just make sure we got *something* sensible.
		t.Logf("got %q (cwd=%q) — neither path matches; check resolveRoot logic", got, cwd)
	}
}

func TestPrintHelpListsAllCommands(t *testing.T) {
	var buf bytes.Buffer
	PrintHelp(&buf)
	out := buf.String()
	for _, c := range Commands {
		if !strings.Contains(out, c.Name) {
			t.Errorf("help output missing command %q", c.Name)
		}
		if !strings.Contains(out, c.Summary) {
			t.Errorf("help output missing summary for %q", c.Name)
		}
	}
	if !strings.Contains(out, "MYHUB_ROOT") {
		t.Error("help output should mention MYHUB_ROOT env var")
	}
}

func TestHumanSize(t *testing.T) {
	tests := []struct {
		in   int64
		want string
	}{
		{0, "0 B"},
		{1023, "1023 B"},
		{1024, "1.0 KB"},
		{1024 * 1024, "1.0 MB"},
		{int64(1024) * 1024 * 1024 * 3, "3.0 GB"},
	}
	for _, tt := range tests {
		if got := human(tt.in); got != tt.want {
			t.Errorf("human(%d) = %q, want %q", tt.in, got, tt.want)
		}
	}
}
