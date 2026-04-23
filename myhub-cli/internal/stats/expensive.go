// Package stats: expensive stats computed only on demand (the `s` modal).
// Entry points may shell out or walk the entire SSD — costs from ~100 ms
// to several seconds. Callers must render a spinner and call from a
// goroutine so the dashboard stays responsive.
package stats

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// Expensive is the full set of on-demand metrics surfaced by the stats
// modal. Zero-valued fields mean "could not compute" — the renderer
// substitutes "—".
type Expensive struct {
	TakenAt          time.Time
	DuHumanTotal     string    // output of `du -sh <root>` — e.g. "32G\t/Volumes/myhub"
	LastActivity     time.Time // newest mtime anywhere under content/
	CompilerLocked   bool      // memory/.compile.lock exists
	ClaudeBinVersion string    // `claude --version` trimmed
}

// CollectExpensive runs the slow queries sequentially (~1-2s total on a
// populated SSD). Every step is independent, so partial failures leave
// other fields populated.
func CollectExpensive(myhubRoot string) Expensive {
	e := Expensive{TakenAt: time.Now()}

	if out, err := exec.Command("du", "-sh", myhubRoot).Output(); err == nil {
		e.DuHumanTotal = strings.TrimSpace(string(out))
	}

	e.LastActivity = newestMtime(filepath.Join(myhubRoot, "content"))

	if _, err := os.Stat(filepath.Join(myhubRoot, "memory", ".compile.lock")); err == nil {
		e.CompilerLocked = true
	}

	if out, err := exec.Command(filepath.Join(myhubRoot, "bin", "claude"), "--version").Output(); err == nil {
		e.ClaudeBinVersion = strings.TrimSpace(string(out))
	}
	return e
}

// newestMtime walks root once, tracking the latest modification time seen.
// Ignores dotfiles and anything under an underscore-prefixed directory
// (archive convention). Costs ~100-300 ms on a content/ tree with a few
// hundred markdown files.
func newestMtime(root string) time.Time {
	var newest time.Time
	_ = filepath.Walk(root, func(_ string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() {
			name := info.Name()
			if strings.HasPrefix(name, ".") && name != "." {
				return filepath.SkipDir
			}
			if strings.HasPrefix(name, "_") {
				return filepath.SkipDir
			}
			return nil
		}
		if strings.HasPrefix(info.Name(), ".") {
			return nil
		}
		if info.ModTime().After(newest) {
			newest = info.ModTime()
		}
		return nil
	})
	return newest
}
