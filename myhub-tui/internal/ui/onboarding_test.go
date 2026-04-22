package ui

import (
	"testing"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/koljaschoepe/myhub/myhub-tui/internal/interview"
)

// typeText simulates the user typing a string character by character.
func typeText(o Onboarding, s string) Onboarding {
	for _, r := range s {
		o, _ = o.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{r}})
	}
	return o
}

func enter(o Onboarding) Onboarding {
	o, _ = o.Update(tea.KeyMsg{Type: tea.KeyEnter})
	return o
}

func TestOnboardingHappyPath(t *testing.T) {
	o := DefaultOnboarding()

	// Step 0: name — free text.
	o = typeText(o, "Kolja")
	o = enter(o)

	// Step 1: language — cursor defaults to Recommended ("Mix"), Enter submits.
	o = enter(o)

	// Step 2: TTS voice — default to Daniel (Recommended), Enter.
	o = enter(o)

	// Step 3: editor — default to nvim (Recommended), Enter.
	var finalCmd tea.Cmd
	o, finalCmd = o.Update(tea.KeyMsg{Type: tea.KeyEnter})

	if !o.Done() {
		t.Fatalf("wizard should be Done after 4 submits")
	}
	if finalCmd == nil {
		t.Fatal("final step should emit OnboardingDoneMsg command")
	}
	msg := finalCmd()
	done, ok := msg.(OnboardingDoneMsg)
	if !ok {
		t.Fatalf("expected OnboardingDoneMsg, got %T", msg)
	}
	if done.Cancelled {
		t.Error("should not be cancelled")
	}
	if done.Config.User.Name != "Kolja" {
		t.Errorf("name: got %q", done.Config.User.Name)
	}
	if done.Config.User.Language != "Mix" {
		t.Errorf("language: got %q", done.Config.User.Language)
	}
	if !done.Config.TTS.Enabled || done.Config.TTS.Voice != "Daniel" {
		t.Errorf("tts: %+v", done.Config.TTS)
	}
	if done.Config.Editor.Default != "nvim" {
		t.Errorf("editor: %q", done.Config.Editor.Default)
	}
}

func TestOnboardingCancelAtAnyStep(t *testing.T) {
	o := DefaultOnboarding()
	// Skip through name with any text.
	o = typeText(o, "X")
	o = enter(o)
	// Cancel at step 2 (language).
	var cmd tea.Cmd
	o, cmd = o.Update(tea.KeyMsg{Type: tea.KeyEsc})

	if !o.Done() {
		t.Fatal("should be Done after cancel")
	}
	if cmd == nil {
		t.Fatal("expected done cmd on cancel")
	}
	done := cmd().(OnboardingDoneMsg)
	if !done.Cancelled {
		t.Error("expected Cancelled=true")
	}
}

func TestOnboardingTTSOffFlagsDisabled(t *testing.T) {
	o := DefaultOnboarding()
	o = typeText(o, "Alex")
	o = enter(o)   // name done
	o = enter(o)   // language = Mix (default Recommended)

	// Move cursor to "Aus" (index 2) and submit.
	o, _ = o.Update(tea.KeyMsg{Type: tea.KeyDown}) // Daniel (rec, cursor 0) → Anna (1)
	o, _ = o.Update(tea.KeyMsg{Type: tea.KeyDown}) // → Aus (2)
	o, _ = o.Update(tea.KeyMsg{Type: tea.KeyEnter})

	// Editor (step 3) — just accept default.
	var cmd tea.Cmd
	o, cmd = o.Update(tea.KeyMsg{Type: tea.KeyEnter})

	done := cmd().(OnboardingDoneMsg)
	if done.Config.TTS.Enabled {
		t.Error("expected TTS.Enabled=false when voice='Aus'")
	}
	if done.Config.TTS.Voice != "Aus" {
		t.Errorf("got voice=%q", done.Config.TTS.Voice)
	}
}

// Ensure the interview's auto-custom mode for the name question works.
func TestOnboardingStartsNameInCustomMode(t *testing.T) {
	o := DefaultOnboarding()
	// First step (name) should accept letters immediately without pressing 'o'.
	o, _ = o.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'K'}})
	// Inspect current interview state indirectly via a non-exported assertion:
	// we look at the view for the typed character.
	if got := o.current.View(); !containsRune(got, 'K') {
		t.Errorf("expected view to contain typed 'K'; got:\n%s", got)
	}
	_ = interview.ContractVersion // sanity-check import
}

func containsRune(s string, r rune) bool {
	for _, c := range s {
		if c == r {
			return true
		}
	}
	return false
}
