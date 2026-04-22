package interview

import (
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
)

func sampleQuestion() Question {
	return Question{
		Version:  ContractVersion,
		Header:   "Sprache",
		Question: "Primärsprache?",
		Options: []Option{
			{Label: "Deutsch"},
			{Label: "English"},
			{Label: "Mix", Description: "Deutsch + Englisch", Recommended: true},
		},
	}
}

func TestDefaultCursorOnRecommended(t *testing.T) {
	m := New(sampleQuestion())
	if m.cursor != 2 {
		t.Errorf("expected cursor on recommended (index 2), got %d", m.cursor)
	}
}

func TestEnterSubmitsCurrent(t *testing.T) {
	m := New(sampleQuestion())
	m2, cmd := m.Update(tea.KeyMsg{Type: tea.KeyEnter})
	if !m2.Done() {
		t.Fatal("expected Done after Enter")
	}
	resp := m2.Response()
	if len(resp.Selected) != 1 || resp.Selected[0] != "Mix" {
		t.Errorf("expected selected=[Mix], got %+v", resp.Selected)
	}
	if resp.Cancelled {
		t.Error("should not be cancelled")
	}
	if cmd == nil {
		t.Error("expected DoneMsg command")
	}
}

func TestEscCancels(t *testing.T) {
	m := New(sampleQuestion())
	m2, _ := m.Update(tea.KeyMsg{Type: tea.KeyEsc})
	if !m2.Done() {
		t.Fatal("expected Done after Esc")
	}
	if !m2.Response().Cancelled {
		t.Error("expected Cancelled=true after Esc")
	}
}

func TestNumberKeyDirectSelect(t *testing.T) {
	m := New(sampleQuestion())
	// Press "1" → should select "Deutsch" immediately (single-select).
	m2, _ := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'1'}})
	if !m2.Done() {
		t.Fatal("'1' should submit single-select")
	}
	if m2.Response().Selected[0] != "Deutsch" {
		t.Errorf("got %+v, want [Deutsch]", m2.Response().Selected)
	}
}

func TestMultiSelectToggle(t *testing.T) {
	q := sampleQuestion()
	q.MultiSelect = true
	m := New(q)
	// Space on cursor (index 2) toggles on.
	m, _ = m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{' '}})
	// Up twice to index 0, space again.
	m, _ = m.Update(tea.KeyMsg{Type: tea.KeyUp})
	m, _ = m.Update(tea.KeyMsg{Type: tea.KeyUp})
	m, _ = m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{' '}})
	// Submit.
	m2, _ := m.Update(tea.KeyMsg{Type: tea.KeyEnter})
	resp := m2.Response()
	if len(resp.Selected) != 2 {
		t.Fatalf("expected 2 selected, got %+v", resp.Selected)
	}
	// Order must match the question's option order: Deutsch, Mix.
	if resp.Selected[0] != "Deutsch" || resp.Selected[1] != "Mix" {
		t.Errorf("order wrong: %+v", resp.Selected)
	}
}

func TestAllowCustomFlow(t *testing.T) {
	q := sampleQuestion()
	q.AllowCustom = true
	m := New(q)
	// Enter custom mode.
	m, _ = m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'o'}})
	if !m.customMode {
		t.Fatal("expected customMode after 'o'")
	}
	// Type "Esperanto".
	for _, r := range "Esperanto" {
		m, _ = m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{r}})
	}
	// Submit.
	m2, _ := m.Update(tea.KeyMsg{Type: tea.KeyEnter})
	if !m2.Done() {
		t.Fatal("expected Done after custom Enter")
	}
	if m2.Response().Custom != "Esperanto" {
		t.Errorf("got %q, want Esperanto", m2.Response().Custom)
	}
}

func TestViewRenders(t *testing.T) {
	m := New(sampleQuestion())
	out := m.View()
	for _, want := range []string{"Primärsprache", "Deutsch", "English", "Mix", "Recommended"} {
		if !strings.Contains(out, want) {
			t.Errorf("view missing %q; got:\n%s", want, out)
		}
	}
}
