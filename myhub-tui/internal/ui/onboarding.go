package ui

import (
	tea "github.com/charmbracelet/bubbletea"

	"github.com/koljaschoepe/myhub/myhub-tui/internal/config"
	"github.com/koljaschoepe/myhub/myhub-tui/internal/interview"
)

// OnboardingStep binds one interview.Question to the config field it
// populates (dotted path, e.g. "user.name"). Order matters — this is a
// linear wizard.
type OnboardingStep struct {
	Field string
	Q     interview.Question
}

// OnboardingDoneMsg is emitted when the wizard finishes. Cancelled=true
// means the user aborted mid-way (via Esc on any step); the partial Config
// must NOT be persisted.
type OnboardingDoneMsg struct {
	Cancelled bool
	Config    config.Config
}

// Onboarding chains a sequence of interview.Models through the standard
// first-run questions.
type Onboarding struct {
	steps   []OnboardingStep
	step    int
	current interview.Model
	answers map[string]interview.Response
	done    bool
}

// DefaultOnboarding builds the canonical first-run flow: name → language
// → TTS voice → default editor. Mirrors /setup in .claude/commands/setup.md.
func DefaultOnboarding() Onboarding {
	steps := []OnboardingStep{
		{Field: "user.name", Q: interview.Question{
			Version:     interview.ContractVersion,
			Header:      "Name",
			Question:    "Wie heißt Du?",
			AllowCustom: true,
			// No Options → interview starts in free-text mode.
		}},
		{Field: "user.language", Q: interview.Question{
			Version:  interview.ContractVersion,
			Header:   "Sprache",
			Question: "Welche Sprache nutzt Du am häufigsten?",
			Options: []interview.Option{
				{Label: "Deutsch"},
				{Label: "English"},
				{Label: "Mix", Description: "Deutsch + English gemischt", Recommended: true},
			},
		}},
		{Field: "tts.voice", Q: interview.Question{
			Version:     interview.ContractVersion,
			Header:      "Stimme",
			Question:    "TTS-Stimme beim Mount?",
			AllowCustom: true,
			Options: []interview.Option{
				{Label: "Daniel", Description: "British male, Jarvis-flavored", Recommended: true},
				{Label: "Anna", Description: "Deutsch, weiblich"},
				{Label: "Aus", Description: "Keine TTS beim Mount"},
			},
		}},
		{Field: "editor.default", Q: interview.Question{
			Version:     interview.ContractVersion,
			Header:      "Editor",
			Question:    "Bevorzugter Editor (kann leer bleiben)?",
			AllowCustom: true,
			Options: []interview.Option{
				{Label: "nvim", Recommended: true},
				{Label: "vim"},
				{Label: "code", Description: "VS Code"},
				{Label: "nano"},
			},
		}},
	}
	o := Onboarding{
		steps:   steps,
		answers: make(map[string]interview.Response),
	}
	o.current = interview.New(steps[0].Q)
	o.current.Step = 0
	o.current.TotalSteps = len(steps)
	return o
}

// Init returns no command; the wizard is input-driven.
func (o Onboarding) Init() tea.Cmd { return nil }

// Update delegates to the current interview. On each step's completion the
// answer is recorded; on the final step a OnboardingDoneMsg is emitted.
func (o Onboarding) Update(msg tea.Msg) (Onboarding, tea.Cmd) {
	if o.done {
		return o, nil
	}
	newCurrent, cmd := o.current.Update(msg)
	o.current = newCurrent

	if !o.current.Done() {
		return o, cmd
	}

	// Record answer.
	resp := o.current.Response()
	o.answers[o.steps[o.step].Field] = resp

	if resp.Cancelled {
		o.done = true
		return o, func() tea.Msg { return OnboardingDoneMsg{Cancelled: true} }
	}

	o.step++
	if o.step >= len(o.steps) {
		o.done = true
		cfg := o.buildConfig()
		return o, func() tea.Msg { return OnboardingDoneMsg{Config: cfg} }
	}
	// Advance to next step.
	o.current = interview.New(o.steps[o.step].Q)
	o.current.Step = o.step
	o.current.TotalSteps = len(o.steps)
	return o, cmd
}

// View renders the current sub-interview, or empty when the wizard is done.
func (o Onboarding) View() string {
	if o.done {
		return ""
	}
	return o.current.View()
}

// Done reports whether the wizard has completed (submitted or cancelled).
func (o Onboarding) Done() bool { return o.done }

func (o Onboarding) buildConfig() config.Config {
	var c config.Config
	c.User.Name = firstOf(o.answers["user.name"])
	c.User.Language = firstOf(o.answers["user.language"])

	voice := firstOf(o.answers["tts.voice"])
	c.TTS.Voice = voice
	c.TTS.Enabled = voice != "" && voice != "Aus"

	c.Editor.Default = firstOf(o.answers["editor.default"])
	return c
}

func firstOf(r interview.Response) string {
	if r.Custom != "" {
		return r.Custom
	}
	if len(r.Selected) > 0 {
		return r.Selected[0]
	}
	return ""
}
