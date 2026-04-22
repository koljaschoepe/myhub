// Package main is the entry point for the myhub TUI — the hub that greets
// the user on SSD mount, lists projects, and launches Claude Code in the one
// they pick.
//
// Phase 1 skeleton: minimal Bubble Tea program that confirms the build +
// static-binary story works. The real dashboard wires in once the theme,
// projects, ui, and launch packages land.
package main

import (
	"fmt"
	"os"

	tea "github.com/charmbracelet/bubbletea"
)

// model is the minimal Elm-style model. It carries nothing yet.
type model struct{}

func (m model) Init() tea.Cmd {
	return nil
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	if k, ok := msg.(tea.KeyMsg); ok {
		switch k.String() {
		case "q", "ctrl+c", "ctrl+d":
			return m, tea.Quit
		}
	}
	return m, nil
}

func (m model) View() string {
	return "\n  myhub · phase 1 skeleton\n" +
		"  bin built from tooling/go on the SSD — no host Go required\n\n" +
		"  [q] quit\n"
}

func main() {
	if _, err := tea.NewProgram(model{}, tea.WithAltScreen()).Run(); err != nil {
		fmt.Fprintf(os.Stderr, "myhub-tui: %v\n", err)
		os.Exit(1)
	}
}
