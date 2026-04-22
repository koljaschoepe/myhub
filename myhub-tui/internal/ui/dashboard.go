// Package ui holds the Bubble Tea model for the myhub TUI dashboard.
package ui

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/koljaschoepe/myhub/myhub-tui/internal/briefer"
	"github.com/koljaschoepe/myhub/myhub-tui/internal/config"
	"github.com/koljaschoepe/myhub/myhub-tui/internal/launch"
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

	// brief holds the current "today" panel content. Starts zero-valued
	// (shows "briefer läuft…"), filled by the first briefReadyMsg.
	brief briefer.Brief

	// TTSVoice is the voice passed to `say`; empty disables speech.
	TTSVoice string

	// onboarding holds the first-run wizard when active; nil means the
	// dashboard is rendering normally.
	onboarding *Onboarding

	// notice surfaces transient feedback ("zurück aus projekt X", "lazygit
	// nicht verdrahtet"). Cleared on next keypress.
	notice string
}

// gitInfoMsg carries a single project's git snapshot back to the model.
type gitInfoMsg struct {
	name string
	info projects.GitInfo
}

// briefReadyMsg is delivered when the briefer agent returns (or times out).
type briefReadyMsg struct{ brief briefer.Brief }

// New loads (or initializes) the registry, scans the filesystem, persists
// the merged view, loads memory/config.toml (for name/TTS prefs), and
// returns a ready-to-run Model. If no config is present and no MYHUB_USER
// override was supplied, the first-run onboarding wizard is armed.
func New(myhubRoot, userName string) (Model, error) {
	regPath := filepath.Join(myhubRoot, "memory", "projects.yaml")
	reg, err := projects.LoadRegistry(regPath)
	if err != nil {
		return Model{}, fmt.Errorf("load registry: %w", err)
	}
	contentProjectsDir := filepath.Join(myhubRoot, "content", "projects")
	_ = reg.Scan(contentProjectsDir)
	_ = reg.Save()

	// Config is best-effort: parse errors degrade to empty config + a
	// notice. Missing file → empty config → onboarding fires.
	cfg, cfgErr := config.Load(config.Path(myhubRoot))
	if cfg == nil {
		cfg = &config.Config{}
	}

	m := Model{
		MyhubRoot: myhubRoot,
		UserName:  firstNonEmpty(userName, cfg.User.Name),
		Registry:  reg,
		gitInfo:   map[string]projects.GitInfo{},
		screen:    ScreenMain,
		TTSVoice:  briefer.DefaultVoice,
	}
	if cfg.TTS.Voice != "" {
		m.TTSVoice = cfg.TTS.Voice
	}
	if !cfg.TTS.Enabled && cfg.User.Name != "" {
		// User explicitly turned TTS off during onboarding.
		m.TTSVoice = ""
	}
	if cfgErr != nil {
		m.notice = "config parse warning: " + cfgErr.Error()
	}
	// First-run: launch the wizard unless the caller provided a username
	// via env (dev override).
	if cfg.NeedsOnboarding() && userName == "" {
		o := DefaultOnboarding()
		m.onboarding = &o
	}
	return m, nil
}

func firstNonEmpty(a, b string) string {
	if a != "" {
		return a
	}
	return b
}

// Init kicks off per-project git-info fetches AND the briefer invocation
// in parallel. Each returns an independent message so the UI populates
// progressively as results arrive.
func (m Model) Init() tea.Cmd {
	return tea.Batch(
		m.refreshAllGitInfo(),
		m.runBriefer(),
	)
}

// runBriefer returns a cmd that invokes `claude -p --agent briefer`
// headlessly and delivers a briefReadyMsg. Capped at 10s by the briefer
// package itself; here we just hand it a fresh context.
func (m Model) runBriefer() tea.Cmd {
	return func() tea.Msg {
		return briefReadyMsg{
			brief: briefer.Run(context.Background(), m.MyhubRoot, m.UserName),
		}
	}
}

func (m Model) refreshAllGitInfo() tea.Cmd {
	var cmds []tea.Cmd
	for _, p := range m.Registry.Active() {
		p := p
		cmds = append(cmds, func() tea.Msg {
			return gitInfoMsg{name: p.Name, info: projects.Info(p.Path)}
		})
	}
	return tea.Batch(cmds...)
}

// Update dispatches messages.
func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	// Onboarding-specific messages are consumed even when the wizard has
	// already closed (so the tail end of its cmds lands in the right branch).
	if done, ok := msg.(OnboardingDoneMsg); ok {
		return m.handleOnboardingDone(done)
	}

	// When the wizard is active, delegate everything except global quit.
	if m.onboarding != nil {
		if k, ok := msg.(tea.KeyMsg); ok {
			if s := k.String(); s == "ctrl+c" {
				m.quitting = true
				return m, tea.Quit
			}
		}
		newO, cmd := m.onboarding.Update(msg)
		m.onboarding = &newO
		return m, cmd
	}

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width, m.height = msg.Width, msg.Height
		return m, nil

	case gitInfoMsg:
		m.gitInfo[msg.name] = msg.info
		return m, nil

	case briefReadyMsg:
		m.brief = msg.brief
		briefer.Speak(m.brief.Text, m.TTSVoice)
		return m, nil

	case launch.ClaudeExitedMsg:
		return m.handleClaudeExit(msg)

	case tea.KeyMsg:
		return m.handleKey(msg)
	}
	return m, nil
}

func (m Model) handleOnboardingDone(msg OnboardingDoneMsg) (tea.Model, tea.Cmd) {
	m.onboarding = nil
	if msg.Cancelled {
		m.notice = "setup abgebrochen — Du kannst es jederzeit mit /setup im Claude-Session nachholen."
		return m, nil
	}
	// Persist config.
	if err := config.Save(config.Path(m.MyhubRoot), &msg.Config); err != nil {
		m.notice = "setup fehlgeschlagen beim Speichern: " + err.Error()
		return m, nil
	}
	m.UserName = msg.Config.User.Name
	m.TTSVoice = msg.Config.TTS.Voice
	if !msg.Config.TTS.Enabled {
		m.TTSVoice = ""
	}
	m.notice = fmt.Sprintf("willkommen, %s. setup gespeichert.", m.UserName)
	// Re-run briefer now that we know the user's name.
	return m, m.runBriefer()
}

func (m Model) handleClaudeExit(msg launch.ClaudeExitedMsg) (Model, tea.Cmd) {
	// Bump last_opened_at so next mount surfaces this project at the top.
	_ = m.Registry.Touch(msg.ProjectName)

	if msg.Err != nil {
		m.notice = fmt.Sprintf("claude beendet mit fehler: %s", msg.Err)
	} else {
		m.notice = fmt.Sprintf("zurück aus %s.", msg.ProjectName)
	}
	m.screen = ScreenMain

	// Re-fetch git info for that project — its state likely changed.
	return m, func() tea.Msg {
		return gitInfoMsg{
			name: msg.ProjectName,
			info: projects.Info(msg.ProjectPath),
		}
	}
}

func (m Model) handleKey(k tea.KeyMsg) (Model, tea.Cmd) {
	m.notice = ""
	// Universal keys first.
	switch k.String() {
	case "q", "ctrl+c", "ctrl+d":
		m.quitting = true
		return m, tea.Quit
	case "?":
		m.notice = m.helpText()
		return m, nil
	}

	active := m.Registry.Active()
	switch m.screen {
	case ScreenMain:
		return m.handleMainKey(k, active)
	case ScreenProject:
		return m.handleProjectKey(k, active)
	}
	return m, nil
}

func (m Model) handleMainKey(k tea.KeyMsg, active []projects.Project) (Model, tea.Cmd) {
	switch k.String() {
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
	case "enter":
		if len(active) > 0 {
			m.screen = ScreenProject
		}
	case "c":
		if len(active) > 0 {
			p := active[m.cursor]
			return m, launch.Claude(m.MyhubRoot, p.Name, p.Path)
		}
	case "g":
		if len(active) > 0 {
			m.notice = "lazygit launch not wired yet (phase 2)"
		}
	default:
		// 1-9 → jump cursor + open project detail (SPEC §7.6).
		if s := k.String(); len(s) == 1 && s[0] >= '1' && s[0] <= '9' {
			n := int(s[0] - '0')
			if n <= len(active) {
				m.cursor = n - 1
				m.screen = ScreenProject
			}
		}
	}
	return m, nil
}

func (m Model) handleProjectKey(k tea.KeyMsg, active []projects.Project) (Model, tea.Cmd) {
	if len(active) == 0 || m.cursor >= len(active) {
		m.screen = ScreenMain
		return m, nil
	}
	p := active[m.cursor]
	switch k.String() {
	case "b", "esc":
		m.screen = ScreenMain
	case "c", "enter":
		return m, launch.Claude(m.MyhubRoot, p.Name, p.Path)
	case "g":
		m.notice = "lazygit launch not wired yet (phase 2)"
	}
	return m, nil
}

func (m Model) helpText() string {
	if m.screen == ScreenProject {
		return "[c/enter] claude  ·  [g] lazygit  ·  [b/esc] back  ·  [q] quit"
	}
	return "[↑↓ jk] move  ·  [enter/1-9] detail  ·  [c] claude  ·  [q] quit"
}

// View renders the active screen. Bubble Tea calls this after every Update.
func (m Model) View() string {
	if m.quitting {
		return ""
	}
	if m.onboarding != nil {
		return "\n" + theme.LeftPad.Render(m.onboarding.View()) + "\n"
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

	// Today panel — briefer output or a "loading" placeholder.
	todayContent := theme.DimStyle.Render("today · briefer läuft…")
	if m.brief.Text != "" {
		label := theme.DimStyle.Render("today")
		if m.brief.IsFallback {
			label = theme.DimStyle.Render("today · (fallback)")
		}
		todayContent = label + "\n" + m.brief.Text
	}
	today := theme.RoundedBorderFg.Render(theme.PaddedPanel.Render(todayContent))
	b.WriteString(theme.LeftPad.Render(today))
	b.WriteString("\n\n")

	// Project list.
	listHead := theme.Subheader.Render("projects") +
		theme.DimStyle.Render("  (↑↓ jk move · enter/1-9 detail · c claude · q quit)")
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

	// Notice + footer.
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
	switch {
	case gi.Branch == "":
		status = theme.DimStyle.Render(theme.GlyphSep)
	case gi.Dirty:
		status = theme.WarningStyle.Render(theme.GlyphDirty)
	}
	cursor := " "
	style := theme.ProjectDefault
	if idx == m.cursor {
		cursor = theme.Header.Render(theme.GlyphArrow)
		style = theme.ProjectSelected
	}

	branch := gi.Branch
	if branch == "" {
		branch = "—"
	}
	commit := gi.LastCommit
	if commit == "" {
		commit = "—"
	}

	row := lipgloss.JoinHorizontal(lipgloss.Top,
		cursor, " ",
		theme.DimStyle.Render(fmt.Sprintf("[%d]", idx+1)), " ",
		style.Render(padRight(p.Label(), 18)), " ",
		theme.DimStyle.Render(padRight(branch, 10)), " ",
		status, "  ",
		theme.DimStyle.Render(commit),
	)
	return theme.LeftPad.Render(row)
}

func (m Model) viewProject() string {
	active := m.Registry.Active()
	if len(active) == 0 || m.cursor >= len(active) {
		return ""
	}
	p := active[m.cursor]
	gi := m.gitInfo[p.Name]

	var b strings.Builder
	b.WriteString("\n")
	b.WriteString(theme.LeftPad.Render(theme.Header.Render("▓▒░ " + p.Label() + " ░▒▓")))
	b.WriteString("\n\n")

	writeField := func(label, value string) {
		if value == "" {
			value = "—"
		}
		line := theme.DimStyle.Render(padRight(label+":", 10)) + value
		b.WriteString(theme.LeftPad.Render(line))
		b.WriteString("\n")
	}
	writeField("path", p.Path)
	writeField("branch", gi.Branch)
	writeField("last", gi.LastCommit)
	if !p.LastOpenedAt.IsZero() {
		writeField("opened", p.LastOpenedAt.Local().Format("2006-01-02 15:04"))
	}
	if p.GitRemote != "" {
		writeField("remote", p.GitRemote)
	}

	b.WriteString("\n")
	if m.notice != "" {
		b.WriteString(theme.LeftPad.Render(theme.WarningStyle.Render(m.notice)))
		b.WriteString("\n\n")
	}
	b.WriteString(theme.LeftPad.Render(theme.DimStyle.Render(
		"[c/enter] claude  ·  [g] lazygit  ·  [b/esc] back  ·  [q] quit")))
	b.WriteString("\n")
	return b.String()
}

// padRight pads s with spaces on the right to at least n visible chars.
func padRight(s string, n int) string {
	if len(s) >= n {
		return s
	}
	return s + strings.Repeat(" ", n-len(s))
}
