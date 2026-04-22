// Package watcher provides a debounced filesystem watcher over the raw
// content directories (content/notes, content/projects, content/communication).
// Wiki is deliberately excluded — the compiler writes there, and watching
// it would loop. Triggers are 30s-debounced by default so a burst of file
// saves produces a single compile.
package watcher

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
)

// Event is delivered on the Events() channel when the debounce timer fires.
type Event struct {
	Kind  string    // "changed"
	Paths []string  // files that changed during the debounce window
	Time  time.Time // when the debounce fired
}

// Watcher is a debounced recursive watcher over content/{notes,projects,
// communication}. It does NOT watch content/wiki/ (the compiler writes
// there) or hidden directories (dotfiles, .git, etc.).
type Watcher struct {
	contentRoot string
	debounce    time.Duration

	fsw     *fsnotify.Watcher
	events  chan Event
	closing chan struct{}

	mu       sync.Mutex
	timer    *time.Timer
	pending  map[string]struct{}
}

// WatchedSubdirs are the top-level content directories the watcher covers.
// Exposed so callers / tests can assert behavior.
var WatchedSubdirs = []string{"notes", "projects", "communication"}

// New creates a watcher. contentRoot is typically filepath.Join(myhubRoot,
// "content"). debounce of 0 falls back to 30s.
func New(contentRoot string, debounce time.Duration) (*Watcher, error) {
	fsw, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}
	if debounce <= 0 {
		debounce = 30 * time.Second
	}
	return &Watcher{
		contentRoot: contentRoot,
		debounce:    debounce,
		fsw:         fsw,
		events:      make(chan Event, 4),
		closing:     make(chan struct{}),
		pending:     make(map[string]struct{}),
	}, nil
}

// Start registers all WatchedSubdirs (recursively) and begins the event
// loop. Missing subdirs are skipped silently (first-run SSDs may not have
// all categories populated yet).
func (w *Watcher) Start() error {
	for _, sub := range WatchedSubdirs {
		root := filepath.Join(w.contentRoot, sub)
		_ = w.addRecursive(root)
	}
	go w.run()
	return nil
}

// Stop closes the underlying fsnotify watcher and the events channel.
// Subsequent reads from Events() return a zero value + ok=false.
func (w *Watcher) Stop() error {
	select {
	case <-w.closing:
		return nil
	default:
		close(w.closing)
	}
	w.mu.Lock()
	if w.timer != nil {
		w.timer.Stop()
		w.timer = nil
	}
	w.mu.Unlock()
	return w.fsw.Close()
}

// Events is the channel of debounced filesystem triggers. One Event per
// debounce window, carrying the paths that changed during the window.
func (w *Watcher) Events() <-chan Event { return w.events }

// addRecursive walks root and registers every directory with fsnotify.
// Skips hidden and well-known-junk dirs.
func (w *Watcher) addRecursive(root string) error {
	return filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if !info.IsDir() {
			return nil
		}
		if shouldSkipDir(path) {
			return filepath.SkipDir
		}
		return w.fsw.Add(path)
	})
}

func (w *Watcher) run() {
	for {
		select {
		case <-w.closing:
			return
		case ev, ok := <-w.fsw.Events:
			if !ok {
				return
			}
			if shouldIgnore(ev) {
				continue
			}
			// If a new directory was created, extend the watch.
			if ev.Op&fsnotify.Create != 0 {
				if info, err := os.Stat(ev.Name); err == nil && info.IsDir() && !shouldSkipDir(ev.Name) {
					_ = w.fsw.Add(ev.Name)
				}
			}
			w.schedule(ev.Name)
		case _, ok := <-w.fsw.Errors:
			if !ok {
				return
			}
			// Errors are logged nowhere in the TUI; dropping them is fine
			// for v1. Future: surface via a w.Errors() channel.
		}
	}
}

// schedule records a change and resets the debounce timer. Coalesces a
// flurry of saves into a single Event.
func (w *Watcher) schedule(path string) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.pending[path] = struct{}{}
	if w.timer != nil {
		w.timer.Stop()
	}
	w.timer = time.AfterFunc(w.debounce, w.fire)
}

func (w *Watcher) fire() {
	w.mu.Lock()
	paths := make([]string, 0, len(w.pending))
	for p := range w.pending {
		paths = append(paths, p)
	}
	w.pending = make(map[string]struct{})
	w.timer = nil
	w.mu.Unlock()

	select {
	case w.events <- Event{Kind: "changed", Paths: paths, Time: time.Now()}:
	case <-w.closing:
	default:
		// events buffer full — drop. Next burst will re-fire.
	}
}

func shouldSkipDir(path string) bool {
	base := filepath.Base(path)
	if strings.HasPrefix(base, ".") {
		return true
	}
	switch base {
	case "node_modules", "wiki", "vendor", "__pycache__", ".git":
		return true
	}
	return false
}

func shouldIgnore(ev fsnotify.Event) bool {
	base := filepath.Base(ev.Name)
	if strings.HasPrefix(base, ".") {
		return true
	}
	// Vim's incantation for atomic save.
	if base == "4913" {
		return true
	}
	return false
}
