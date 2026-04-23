package stats

import (
	"os"
	"path/filepath"
	"testing"
)

// TestSnapshotZeroDoesNotPanic documents that a Collector over a fresh
// temp dir returns a sensible zero-ish snapshot rather than crashing.
func TestSnapshotZeroDoesNotPanic(t *testing.T) {
	c := NewCollector(t.TempDir())
	s := c.Capture()
	if s.TakenAt.IsZero() {
		t.Error("TakenAt should be set")
	}
	if s.Uptime < 0 {
		t.Errorf("Uptime negative: %s", s.Uptime)
	}
	if s.WikiArticles != 0 || s.MemoryItems != 0 || s.Sessions != 0 {
		t.Errorf("expected zero counts on empty dir: %+v", s)
	}
}

// TestCountMarkdownIgnoresClaudeMd verifies CLAUDE.md files don't inflate
// the wiki article count — they're per-dir agent guides, not articles.
func TestCountMarkdownIgnoresClaudeMd(t *testing.T) {
	root := t.TempDir()
	wiki := filepath.Join(root, "content", "wiki")
	_ = os.MkdirAll(wiki, 0755)
	for _, name := range []string{"a.md", "b.md", "CLAUDE.md"} {
		_ = os.WriteFile(filepath.Join(wiki, name), []byte("# x"), 0644)
	}
	c := NewCollector(root)
	s := c.Capture()
	if s.WikiArticles != 2 {
		t.Errorf("want 2 articles (CLAUDE.md skipped); got %d", s.WikiArticles)
	}
}

// TestSnapshotEqualIgnoresTakenAt confirms the equality used for
// diff-render skipping ignores the monotonically-changing timestamp.
func TestSnapshotEqualIgnoresTakenAt(t *testing.T) {
	a := Snapshot{FreeBytes: 100, Projects: 3}
	b := Snapshot{FreeBytes: 100, Projects: 3}
	b.TakenAt = a.TakenAt.Add(42)
	if !a.Equal(b) {
		t.Error("snapshots with different TakenAt should still be Equal")
	}
	c := a
	c.FreeBytes = 200
	if a.Equal(c) {
		t.Error("snapshots differing in FreeBytes should NOT be Equal")
	}
}

// TestReadCompileState parses the one JSON field without pulling in
// encoding/json — confirm both the happy path and the missing-file path.
func TestReadCompileState(t *testing.T) {
	if !readCompileState(filepath.Join(t.TempDir(), "none.json")).IsZero() {
		t.Error("missing file should return zero time")
	}
	p := filepath.Join(t.TempDir(), "state.json")
	_ = os.WriteFile(p, []byte(`{"last_compile":"2026-04-22T23:37:16Z","ok":true}`), 0644)
	got := readCompileState(p)
	if got.IsZero() {
		t.Error("expected parsed time from happy-path payload")
	}
}
