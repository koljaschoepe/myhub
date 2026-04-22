package ui

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
)

// Tests below pass a non-empty userName to New() — this bypasses the
// first-run onboarding wizard so the main dashboard logic is reachable.
// The onboarding-auto-arm path is covered by onboarding_test.go.

// TestViewDoesNotPanicOnEmpty exercises the empty-state path: no projects,
// no git info, named user (so onboarding is skipped). View() must return
// non-empty without panic.
func TestViewDoesNotPanicOnEmpty(t *testing.T) {
	tmp := t.TempDir()
	if err := os.MkdirAll(filepath.Join(tmp, "content", "projects"), 0755); err != nil {
		t.Fatal(err)
	}
	m, err := New(tmp, "testuser")
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	out := m.View()
	if out == "" {
		t.Fatal("View returned empty on empty registry")
	}
	if !strings.Contains(out, "myhub") {
		t.Errorf("View missing 'myhub' header; got:\n%s", out)
	}
	if !strings.Contains(out, "noch keine Projekte") {
		t.Errorf("View missing empty-state hint; got:\n%s", out)
	}
}

// TestKeyQuit confirms q sets quitting and returns tea.Quit.
func TestKeyQuit(t *testing.T) {
	m, err := New(t.TempDir(), "testuser")
	if err != nil {
		t.Fatal(err)
	}
	next, cmd := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'q'}})
	if cmd == nil {
		t.Error("expected tea.Quit command on 'q', got nil")
	}
	if !next.(Model).quitting {
		t.Error("expected quitting=true after 'q'")
	}
}

// TestCursorWrap verifies up/down do not step past the list bounds.
func TestCursorWrap(t *testing.T) {
	tmp := t.TempDir()
	projectsDir := filepath.Join(tmp, "content", "projects")
	for _, name := range []string{"alpha", "beta", "gamma"} {
		d := filepath.Join(projectsDir, name)
		_ = os.MkdirAll(d, 0755)
		_ = os.WriteFile(filepath.Join(d, "CLAUDE.md"), []byte("# test"), 0644)
	}
	m, err := New(tmp, "testuser")
	if err != nil {
		t.Fatal(err)
	}

	// Start at cursor 0; up is a no-op.
	next, _ := m.Update(tea.KeyMsg{Type: tea.KeyUp})
	if next.(Model).cursor != 0 {
		t.Errorf("up at top: cursor=%d, want 0", next.(Model).cursor)
	}

	// Step down 10 times: cursor should land at 2 (len-1), not beyond.
	mm := m
	for i := 0; i < 10; i++ {
		n, _ := mm.Update(tea.KeyMsg{Type: tea.KeyDown})
		mm = n.(Model)
	}
	if mm.cursor != 2 {
		t.Errorf("cursor wrap: got %d, want 2", mm.cursor)
	}
}

// TestOnboardingAutoArmsForEmptyConfig verifies New() arms the wizard when
// no config exists and no userName override is given.
func TestOnboardingAutoArmsForEmptyConfig(t *testing.T) {
	m, err := New(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	if m.onboarding == nil {
		t.Fatal("expected onboarding to be armed when config missing + no userName override")
	}
}
