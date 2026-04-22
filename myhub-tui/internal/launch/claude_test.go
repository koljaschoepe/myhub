package launch

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestCheckMissing(t *testing.T) {
	// Use an empty root and strip the current PATH so neither lookup hits.
	t.Setenv("PATH", "")
	_, err := Check(t.TempDir())
	if !errors.Is(err, ErrBinaryNotFound) {
		t.Errorf("expected ErrBinaryNotFound, got %v", err)
	}
}

func TestCheckFindsSSDBinary(t *testing.T) {
	root := t.TempDir()
	binDir := filepath.Join(root, "bin")
	if err := os.MkdirAll(binDir, 0755); err != nil {
		t.Fatal(err)
	}
	ssdBin := filepath.Join(binDir, "claude")
	if err := os.WriteFile(ssdBin, []byte("#!/bin/sh\nexit 0\n"), 0755); err != nil {
		t.Fatal(err)
	}
	got, err := Check(root)
	if err != nil {
		t.Fatalf("Check: %v", err)
	}
	if got != ssdBin {
		t.Errorf("got %q, want %q", got, ssdBin)
	}
}
