// Package ui holds the Bubble Tea model for the myhub TUI dashboard.
package ui

import (
	"fmt"
	"path/filepath"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/koljaschoepe/myhub/myhub-tui/internal/projects"
	"github.com/koljaschoepe/myhub/myhub-tui/internal/theme"
)

// Screen is a top-level view the dashboard can render.
type Screen int

const (
	ScreenMain Screen = iota
	ScreenProject
)

// Model is the Elm-style state for the TUI.
type Model struct {
	MyhubRoot string             // absolute SSD root path
	UserName  string             // pulled from config; empty → anonymous greeting
	Registry  *projects.Registry // lives at memory/projects.yaml
	gitInfo   map[string]projects.GitInfo

	screen Screen
	cursor int

	width, height int
	quitting      bool

	// pending action surfaced to the user after a key press — cleared on
	// next input. Phase 1D replaces this with tea.ExecProcess launches.
	notice string
}

// gitInfoMsg carries a single project's git snapshot back to the model.
type gitInfoMsg struct {
	name string
	info projects.GitInfo
}

// New wires up the model for the given SSD root + optional user name.
// It loads (or initializes) the project registry, scans the filesystem, and
// persists the merged view — so subsequent mounts see the same order.
func New(myhubRoot, userName string) (Model, error) {
	regPath := filepath.Join(myhubRoot, "memory", "projects.yaml")
	reg, err := projects.LoadRegistry(regPath)
	if err != nil {
		return Model{}, fmt.Errorf("load registry: %w", err)
	}
	contentProjectsDir := filepath.Join(myhubRoot, "content", "projects")
	// ReadDir failures are non-fatal — first-run has no projects yet.
	_ = reg.Scan(contentProjectsDir)
	_ = reg.Save()

	return Model{
		MyhubRoot: myhubRoot,
		UserName:  userName,
		Registry:  reg,
		gitInfo:   map[string]projects.GitInfo{},
		screen:    ScreenMain,
	}, nil
}

// Init kicks off per-project git-info fetches in parallel. Each completes
// as an independent gitInfoMsg so the UI can render progressively.
func (m Model) Init() tea.Cmd {
	var cmds []tea.Cmd
	for _, p := range m.Registry.Active() {
		p := p // capture
		cmds = append(cmds, func() tea.Msg {
			return gitInfoMsg{name: p.Name, info: projects.Info(p.Path)}
		})
	}
	return tea.Batch(cmds...)
}

// Update dispatches messages.
func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width, m.height = msg.Width, msg.Height
		return m, nil

	case gitInfoMsg:
		m.gitInfo[msg.name] = msg.info
		return m, nil

	case tea.KeyMsg:
		return m.handleKey(msg)
	}
	return m, nil
}

func (m Model) handleKey(k tea.KeyMsg) (Model, tea.Cmd) {
	m.notice = ""
	active := m.Registry.Active()

	switch k.String() {
	case "q", "ctrl+c", "ctrl+d":
		m.quitting = true
		return m, tea.Quit

	case "up", "k":
		if m.cursor > 0 {
			m.cursor--
		}
	case "down", "j":
		if m.cursor+1 < len(active) {
			m.cursor++
		}
	case "home":
		m.cursor = 0
	case "end", "G":
		if len(active) > 0 {
			m.cursor = len(active) - 1
		}

	case "enter", "c":
		if len(active) > 0 {
			p := active[m.cursor]
			m.notice = fmt.Sprintf("would launch claude in %s  (wired in phase 1D)", p.Path)
		}

	case "g":
		// SPEC §7.6: g launches lazygit in the selected project. Not wired yet.
		if len(active) > 0 {
			m.notice = "lazygit launch not wired yet (phase 2)"
		}

	case "b", "esc":
		if m.screen != ScreenMain {
			m.screen = ScreenMain
		}

	case "?":
		m.notice = "keys: ↑↓ j k · 1-9 select · enter/c claude · b/esc back · q quit"

	default:
		// Number keys 1-9 jump the cursor (and, in phase 1D, launch claude).
		if len(k.String()) == 1 {
			ch := k.String()[0]
			if ch >= '1' && ch <= '9' {
				n := int(ch - '0')
				if n <= len(active) {
					m.cursor = n - 1
					if p := active[m.cursor]; true {
						m.notice = fmt.Sprintf("would launch claude in %s  (wired in phase 1D)", p.Path)
					}
				}
			}
		}
	}
	return m, nil
}

// View renders the active screen. Bubble Tea calls this after every Update.
func (m Model) View() string {
	if m.quitting {
		return ""
	}
	switch m.screen {
	case ScreenMain:
		return m.viewMain()
	case ScreenProject:
		return m.viewProject()
	}
	return ""
}

func (m Model) viewMain() string {
	var b strings.Builder
	b.WriteString("\n")

	// Header: logo + greeting.
	logo := theme.Header.Render("▓▒░ myhub ░▒▓")
	greet := theme.DimStyle.Render(theme.Greet(time.Now(), m.UserName))
	b.WriteString(theme.LeftPad.Render(logo + "   " + greet))
	b.WriteString("\n\n")

	// Briefer placeholder (phase 2 will fill this).
	today := theme.RoundedBorderFg.Render(
		theme.PaddedPanel.Render(
			theme.DimStyle.Render("today · briefer läuft…"),
		),
	)
	b.WriteString(theme.LeftPad.Render(today))
	b.WriteString("\n\n")

	// Project list.
	listHead := theme.Subheader.Render("projects") +
		theme.DimStyle.Render("  (↑↓ / j k move · 1-9 jump · enter/c claude · q quit)")
	b.WriteString(theme.LeftPad.Render(listHead))
	b.WriteString("\n")

	active := m.Registry.Active()
	if len(active) == 0 {
		b.WriteString(theme.LeftPad.Render(theme.DimStyle.Render(
			"  (noch keine Projekte — leg eins unter content/projects/<name>/ mit CLAUDE.md an.)")))
		b.WriteString("\n")
	} else {
		for i, p := range active {
			b.WriteString(m.renderProjectRow(i, p))
			b.WriteString("\n")
		}
	}

	// Notice / status line.
	b.WriteString("\n")
	if m.notice != "" {
		b.WriteString(theme.LeftPad.Render(theme.WarningStyle.Render(m.notice)))
		b.WriteString("\n")
	}
	b.WriteString(theme.LeftPad.Render(theme.DimStyle.Render("[q] quit  [?] help")))
	b.WriteString("\n")

	return b.String()
}

func (m Model) renderProjectRow(idx int, p projects.Project) string {
	gi := m.gitInfo[p.Name]
	status := theme.SuccessStyle.Render(theme.GlyphCheck)
	if gi.Dirty {
		status = theme.WarningStyle.Render(theme.GlyphDirty)
	}
	if gi.Branch == "" {
		status = theme.DimStyle.Render(theme.GlyphSep)
	}
	num := fmt.Sprintf("[%d]", idx+1)
	name := p.Label()
	style := theme.ProjectDefault
	cursor := " "
	if idx == m.cursor {
		style = theme.ProjectSelected
		cursor = theme.Header.Render(theme.GlyphArrow)
	}

	branch := gi.Branch
	if branch == "" {
		branch = theme.DimStyle.Render("—")
	} else {
		branch = theme.DimStyle.Render(branch)
	}
	commit := gi.LastCommit
	if commit == "" {
		commit = theme.DimStyle.Render("—")
	} else {
		commit = theme.DimStyle.Render(commit)
	}

	row := lipgloss.JoinHorizontal(lipgloss.Top,
		cursor, " ",
		theme.DimStyle.Render(num), " ",
		style.Render(padRight(name, 18)), " ",
		branch, " ",
		status, "  ",
		commit,
	)
	return theme.LeftPad.Render(row)
}

func (m Model) viewProject() string {
	active := m.Registry.Active()
	if len(active) == 0 || m.cursor >= len(active) {
		return ""
	}
	p := active[m.cursor]
	return fmt.Sprintf("\n  %s\n  %s\n  [b] back\n", p.Label(), p.Path)
}

// padRight pads s with spaces on the right to at least n visible chars.
// Simple version — does not account for ANSI. Callers pass raw strings.
func padRight(s string, n int) string {
	if len(s) >= n {
		return s
	}
	return s + strings.Repeat(" ", n-len(s))
}
