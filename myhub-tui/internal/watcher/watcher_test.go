package watcher

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestWatcherFiresOnWrite(t *testing.T) {
	tmp := t.TempDir()
	notes := filepath.Join(tmp, "notes")
	if err := os.MkdirAll(notes, 0755); err != nil {
		t.Fatal(err)
	}

	// Short debounce so the test runs fast.
	w, err := New(tmp, 100*time.Millisecond)
	if err != nil {
		t.Fatal(err)
	}
	if err := w.Start(); err != nil {
		t.Fatal(err)
	}
	defer w.Stop()

	// Write a file.
	f := filepath.Join(notes, "hello.md")
	if err := os.WriteFile(f, []byte("# hello"), 0644); err != nil {
		t.Fatal(err)
	}

	select {
	case ev := <-w.Events():
		if ev.Kind != "changed" {
			t.Errorf("kind: got %q", ev.Kind)
		}
		if len(ev.Paths) == 0 {
			t.Error("no paths reported")
		}
	case <-time.After(1 * time.Second):
		t.Fatal("timed out waiting for event")
	}
}

func TestWatcherDebouncesBurst(t *testing.T) {
	tmp := t.TempDir()
	notes := filepath.Join(tmp, "notes")
	if err := os.MkdirAll(notes, 0755); err != nil {
		t.Fatal(err)
	}
	w, err := New(tmp, 200*time.Millisecond)
	if err != nil {
		t.Fatal(err)
	}
	if err := w.Start(); err != nil {
		t.Fatal(err)
	}
	defer w.Stop()

	// Burst of 5 writes within 100ms; should coalesce into one Event.
	for i := 0; i < 5; i++ {
		f := filepath.Join(notes, "note-x.md")
		_ = os.WriteFile(f, []byte("iter"), 0644)
		time.Sleep(20 * time.Millisecond)
	}

	// First event — should arrive ~200ms after the last write.
	select {
	case <-w.Events():
	case <-time.After(1 * time.Second):
		t.Fatal("first event timed out")
	}

	// No second event should follow within another 400ms.
	select {
	case ev := <-w.Events():
		t.Errorf("unexpected second event: %+v", ev)
	case <-time.After(400 * time.Millisecond):
		// good
	}
}

func TestWatcherIgnoresHidden(t *testing.T) {
	tmp := t.TempDir()
	notes := filepath.Join(tmp, "notes")
	if err := os.MkdirAll(notes, 0755); err != nil {
		t.Fatal(err)
	}
	w, err := New(tmp, 100*time.Millisecond)
	if err != nil {
		t.Fatal(err)
	}
	_ = w.Start()
	defer w.Stop()

	// Write a dotfile.
	_ = os.WriteFile(filepath.Join(notes, ".DS_Store"), []byte("x"), 0644)

	// No event should be emitted for a dotfile-only burst.
	select {
	case ev := <-w.Events():
		t.Errorf("dotfile write produced event: %+v", ev)
	case <-time.After(300 * time.Millisecond):
		// good
	}
}

func TestWatcherSkipsWikiDir(t *testing.T) {
	tmp := t.TempDir()
	// content/wiki is where the compiler writes — watcher must not watch it.
	wiki := filepath.Join(tmp, "wiki")
	_ = os.MkdirAll(wiki, 0755)
	notes := filepath.Join(tmp, "notes")
	_ = os.MkdirAll(notes, 0755)

	w, err := New(tmp, 100*time.Millisecond)
	if err != nil {
		t.Fatal(err)
	}
	_ = w.Start()
	defer w.Stop()

	// Write inside wiki — should NOT trigger.
	_ = os.WriteFile(filepath.Join(wiki, "article.md"), []byte("x"), 0644)
	select {
	case ev := <-w.Events():
		t.Errorf("wiki write triggered event: %+v", ev)
	case <-time.After(300 * time.Millisecond):
		// good — no event
	}

	// Write inside notes — SHOULD trigger.
	_ = os.WriteFile(filepath.Join(notes, "real.md"), []byte("x"), 0644)
	select {
	case <-w.Events():
		// good
	case <-time.After(500 * time.Millisecond):
		t.Error("notes write did not trigger event")
	}
}
