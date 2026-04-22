// Package interview provides a structured multi-choice question primitive.
// Shared across the TUI (as a modal overlay sub-model), agents (emit the
// JSON contract, TUI renders), and the `myhub` CLI (`myhub ask <file>`).
// UX is identical everywhere a decision point surfaces — mirror of Claude
// Code's AskUserQuestion tool, per SPEC §12 and the "structured questions,
// not blank prompts" principle (§2.8).
package interview

import (
	"fmt"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/koljaschoepe/myhub/myhub-tui/internal/theme"
)

// ContractVersion is the current JSON/YAML schema version for Question/Response.
const ContractVersion = 1

// Option is one selectable choice inside a Question.
type Option struct {
	Label       string `json:"label" yaml:"label"`
	Description string `json:"description,omitempty" yaml:"description,omitempty"`
	Recommended bool   `json:"recommended,omitempty" yaml:"recommended,omitempty"`
}

// Question is the prompt + set of options the user picks from.
// Shape intentionally mirrors Claude Code's AskUserQuestion tool.
type Question struct {
	Version     int      `json:"version" yaml:"version"`
	Header      string   `json:"header,omitempty" yaml:"header,omitempty"`
	Question    string   `json:"question" yaml:"question"`
	MultiSelect bool     `json:"multi_select,omitempty" yaml:"multi_select,omitempty"`
	AllowCustom bool     `json:"allow_custom,omitempty" yaml:"allow_custom,omitempty"`
	Options     []Option `json:"options" yaml:"options"`
}

// Response captures what the user picked (or that they cancelled).
type Response struct {
	Version    int       `json:"version"`
	Selected   []string  `json:"selected,omitempty"`
	Custom     string    `json:"custom,omitempty"`
	Cancelled  bool      `json:"cancelled,omitempty"`
	AnsweredAt time.Time `json:"answered_at"`
}

// DoneMsg is emitted when the interview completes so a parent model can
// detect submission / cancellation without polling Done().
type DoneMsg struct{ Response Response }

// Model is the Bubble Tea model for the interview overlay.
type Model struct {
	Q Question
	// Step/TotalSteps power the "step N/M" indicator for multi-question
	// wizards. 0/0 means single-question (no indicator rendered).
	Step       int
	TotalSteps int

	cursor      int
	selected    map[int]bool
	customMode  bool
	customInput string

	done     bool
	response Response
}

// New constructs a Model. If any option has Recommended=true, the cursor
// defaults to the first such option (nicer ergonomics: Enter accepts the
// recommendation).
func New(q Question) Model {
	m := Model{Q: q, selected: make(map[int]bool)}
	for i, o := range q.Options {
		if o.Recommended {
			m.cursor = i
			break
		}
	}
	return m
}

// Init has nothing to do — interview reacts to key events only.
func (m Model) Init() tea.Cmd { return nil }

// Update handles key events and returns a (potentially done) Model plus
// a cmd that emits DoneMsg on submit/cancel.
func (m Model) Update(msg tea.Msg) (Model, tea.Cmd) {
	if m.done {
		return m, nil
	}
	if k, ok := msg.(tea.KeyMsg); ok {
		if m.customMode {
			return m.handleCustomKey(k)
		}
		return m.handleKey(k)
	}
	return m, nil
}

// Done reports whether the user has submitted or cancelled.
func (m Model) Done() bool { return m.done }

// Response returns the user's answer (valid only after Done()).
func (m Model) Response() Response { return m.response }

func (m Model) handleKey(k tea.KeyMsg) (Model, tea.Cmd) {
	switch k.String() {
	case "up", "k":
		if m.cursor > 0 {
			m.cursor--
		}
	case "down", "j":
		if m.cursor+1 < len(m.Q.Options) {
			m.cursor++
		}
	case " ", "space":
		if m.Q.MultiSelect {
			m.selected[m.cursor] = !m.selected[m.cursor]
		}
	case "enter":
		return m.submit()
	case "esc":
		return m.cancel()
	case "o":
		if m.Q.AllowCustom {
			m.customMode = true
			m.customInput = ""
		}
	}
	// Number keys 1-9 for direct selection (single-select) / toggle (multi).
	if s := k.String(); len(s) == 1 && s[0] >= '1' && s[0] <= '9' {
		n := int(s[0] - '0')
		if n <= len(m.Q.Options) {
			m.cursor = n - 1
			if !m.Q.MultiSelect {
				return m.submit()
			}
			m.selected[m.cursor] = !m.selected[m.cursor]
		}
	}
	return m, nil
}

func (m Model) handleCustomKey(k tea.KeyMsg) (Model, tea.Cmd) {
	switch k.String() {
	case "enter":
		if strings.TrimSpace(m.customInput) == "" {
			return m, nil
		}
		m.response = Response{
			Version:    ContractVersion,
			Custom:     m.customInput,
			AnsweredAt: time.Now(),
		}
		m.done = true
		return m, func() tea.Msg { return DoneMsg{Response: m.response} }
	case "esc":
		m.customMode = false
		m.customInput = ""
	case "backspace":
		if len(m.customInput) > 0 {
			r := []rune(m.customInput)
			m.customInput = string(r[:len(r)-1])
		}
	default:
		for _, r := range k.Runes {
			m.customInput += string(r)
		}
	}
	return m, nil
}

func (m Model) submit() (Model, tea.Cmd) {
	var selected []string
	if m.Q.MultiSelect {
		// Iterate Options (not the map) to preserve option order.
		for i, o := range m.Q.Options {
			if m.selected[i] {
				selected = append(selected, o.Label)
			}
		}
	} else if len(m.Q.Options) > 0 {
		selected = []string{m.Q.Options[m.cursor].Label}
	}
	m.response = Response{
		Version:    ContractVersion,
		Selected:   selected,
		AnsweredAt: time.Now(),
	}
	m.done = true
	return m, func() tea.Msg { return DoneMsg{Response: m.response} }
}

func (m Model) cancel() (Model, tea.Cmd) {
	m.response = Response{
		Version:    ContractVersion,
		Cancelled:  true,
		AnsweredAt: time.Now(),
	}
	m.done = true
	return m, func() tea.Msg { return DoneMsg{Response: m.response} }
}

// View renders the modal as a rounded-border panel. Intended to be framed
// by a parent model (dashboard etc.) — we render our own inner chrome but
// don't try to center on the parent canvas.
func (m Model) View() string {
	var b strings.Builder

	// Header chip + step indicator.
	header := m.Q.Header
	if m.TotalSteps > 0 {
		if header != "" {
			header += " · "
		}
		header += fmt.Sprintf("Step %d/%d", m.Step+1, m.TotalSteps)
	}
	if header != "" {
		b.WriteString(theme.Header.Render(header))
		b.WriteString("\n")
	}

	// Question text.
	b.WriteString(theme.ProjectDefault.Render(m.Q.Question))
	b.WriteString("\n\n")

	// Options.
	for i, o := range m.Q.Options {
		cursor := "   "
		if i == m.cursor {
			cursor = theme.Header.Render(" " + theme.GlyphArrow + " ")
		}
		var mark string
		if m.Q.MultiSelect {
			if m.selected[i] {
				mark = theme.SuccessStyle.Render("[x]")
			} else {
				mark = theme.DimStyle.Render("[ ]")
			}
		} else {
			mark = theme.DimStyle.Render(fmt.Sprintf("[%d]", i+1))
		}
		label := o.Label
		if o.Recommended {
			label += theme.DimStyle.Render(" (Recommended)")
		}
		style := theme.ProjectDefault
		if i == m.cursor {
			style = theme.ProjectSelected
		}
		b.WriteString(cursor + mark + " " + style.Render(label) + "\n")
		if o.Description != "" {
			b.WriteString("     " + theme.DimStyle.Render(wrap(o.Description, 62)) + "\n")
		}
	}

	// Custom-input UI.
	if m.customMode {
		b.WriteString("\n")
		prompt := theme.Header.Render("> ") + m.customInput + theme.Header.Render("▌")
		b.WriteString(prompt + "\n")
		b.WriteString(theme.DimStyle.Render("[enter] submit · [esc] cancel custom") + "\n")
	} else {
		// Keymap footer.
		keys := "[↑↓/jk] move · [enter] submit · [esc] cancel"
		if m.Q.MultiSelect {
			keys = "[↑↓/jk] move · [space] toggle · [enter] submit · [esc] cancel"
		}
		if m.Q.AllowCustom {
			keys += " · [o] other"
		}
		b.WriteString("\n")
		b.WriteString(theme.DimStyle.Render(keys))
		b.WriteString("\n")
	}

	// Wrap in a rounded border, padding, max width 68.
	panel := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(theme.Primary).
		Padding(1, 2).
		MaxWidth(72).
		Render(b.String())

	return panel
}

// wrap is a naive word-wrapper — line-breaks the string at the last space
// before width. Good enough for short descriptions; proper wrapping via
// Lipgloss's Width can be layered in if needed.
func wrap(s string, width int) string {
	if len(s) <= width {
		return s
	}
	var out strings.Builder
	words := strings.Fields(s)
	line := ""
	for _, w := range words {
		if line == "" {
			line = w
			continue
		}
		if len(line)+1+len(w) > width {
			out.WriteString(line)
			out.WriteString("\n     ")
			line = w
		} else {
			line += " " + w
		}
	}
	out.WriteString(line)
	return out.String()
}
