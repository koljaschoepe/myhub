package wikistate

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func mkFile(t *testing.T, path string, mtime time.Time) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("x"), 0644); err != nil {
		t.Fatal(err)
	}
	if !mtime.IsZero() {
		if err := os.Chtimes(path, mtime, mtime); err != nil {
			t.Fatal(err)
		}
	}
}

func TestEmptyIsEmptyAndNoContent(t *testing.T) {
	tmp := t.TempDir()
	f := Scan(tmp)
	if !f.NoContent {
		t.Error("expected NoContent=true on empty tmp")
	}
	if !f.Empty {
		t.Error("expected Empty=true on empty tmp")
	}
	if f.IsStale() {
		t.Error("empty is never stale")
	}
	if f.Label() != "wiki: (kein content)" {
		t.Errorf("label: got %q", f.Label())
	}
}

func TestWikiAheadOfRaw(t *testing.T) {
	tmp := t.TempDir()
	earlier := time.Now().Add(-2 * time.Hour)
	later := time.Now()
	mkFile(t, filepath.Join(tmp, "content", "notes", "a.md"), earlier)
	mkFile(t, filepath.Join(tmp, "content", "wiki", "people", "alex.md"), later)

	f := Scan(tmp)
	if f.IsStale() {
		t.Error("wiki ahead of raw should NOT be stale")
	}
	if f.Label() != "wiki: aktuell" {
		t.Errorf("label: got %q, want 'wiki: aktuell'", f.Label())
	}
}

func TestRawAheadOfWikiIsStale(t *testing.T) {
	tmp := t.TempDir()
	earlier := time.Now().Add(-2 * time.Hour)
	later := time.Now().Add(-30 * time.Minute)
	mkFile(t, filepath.Join(tmp, "content", "wiki", "people", "alex.md"), earlier)
	mkFile(t, filepath.Join(tmp, "content", "notes", "a.md"), later)

	f := Scan(tmp)
	if !f.IsStale() {
		t.Fatal("raw ahead of wiki should be stale")
	}
	staleFor := f.StaleFor()
	if staleFor < 50*time.Minute || staleFor > 110*time.Minute {
		t.Errorf("stale for %s; expected ~1h30m", staleFor)
	}
	if got := f.Label(); got != "wiki: 1h stale" {
		t.Errorf("label: got %q, want 'wiki: 1h stale'", got)
	}
}

func TestWikiEmpty(t *testing.T) {
	tmp := t.TempDir()
	mkFile(t, filepath.Join(tmp, "content", "notes", "a.md"), time.Time{})
	f := Scan(tmp)
	if !f.Empty {
		t.Error("wiki should be Empty with no wiki files")
	}
	if f.Label() != "wiki: leer" {
		t.Errorf("label: got %q", f.Label())
	}
}

func TestHumanDurations(t *testing.T) {
	tests := []struct {
		d    time.Duration
		want string
	}{
		{30 * time.Second, "<1m"},
		{5 * time.Minute, "5m"},
		{3 * time.Hour, "3h"},
		{2 * 24 * time.Hour, "2d"},
	}
	for _, tt := range tests {
		if got := human(tt.d); got != tt.want {
			t.Errorf("human(%s) = %q, want %q", tt.d, got, tt.want)
		}
	}
}
