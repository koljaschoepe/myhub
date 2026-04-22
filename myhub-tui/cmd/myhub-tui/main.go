// Package main is the entry point for the myhub TUI — the hub that greets
// the user on SSD mount, lists projects, and launches Claude Code in the one
// they pick.
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/koljaschoepe/myhub/myhub-tui/internal/ui"
)

// resolveMyhubRoot picks the SSD root in this order:
//  1. $MYHUB_ROOT (set by .boot/launcher.sh on real deployments)
//  2. the directory that contains this binary's parent (for `bin/myhub-tui`)
//  3. current working directory as a last resort (dev mode)
func resolveMyhubRoot() string {
	if r := os.Getenv("MYHUB_ROOT"); r != "" {
		return r
	}
	if exe, err := os.Executable(); err == nil {
		if abs, err := filepath.EvalSymlinks(exe); err == nil {
			return filepath.Dir(filepath.Dir(abs)) // bin/myhub-tui → parent of bin/
		}
	}
	cwd, _ := os.Getwd()
	return cwd
}

func resolveUserName() string {
	// Phase 2 reads from memory/config.toml; for now, honor an env override
	// so `MYHUB_USER=Kolja make run` gives a personalized greeting.
	return os.Getenv("MYHUB_USER")
}

func main() {
	var safeMode bool
	flag.BoolVar(&safeMode, "safe-mode", false,
		"read-only: no TTS, no YAML writes, no auto-compile, no onboarding wizard")
	flag.Parse()

	// Env var equivalent so the launcher can flip safe-mode without
	// touching argv — useful if the hook layer decides to downgrade.
	if os.Getenv("MYHUB_SAFE_MODE") == "1" {
		safeMode = true
	}

	root := resolveMyhubRoot()
	name := resolveUserName()

	m, err := ui.New(root, name, ui.Options{SafeMode: safeMode})
	if err != nil {
		fmt.Fprintf(os.Stderr, "myhub-tui: %v\n", err)
		os.Exit(1)
	}

	if _, err := tea.NewProgram(m, tea.WithAltScreen()).Run(); err != nil {
		fmt.Fprintf(os.Stderr, "myhub-tui: %v\n", err)
		os.Exit(1)
	}
}
