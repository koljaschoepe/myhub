// Package wikistate reports whether content/wiki/ is up to date relative
// to the raw content files it's derived from. Used by the dashboard header
// to show "wiki: up to date" / "wiki: 3h stale" / "wiki: empty".
//
// Freshness is measured purely from mtimes — no compile-state.json is
// required. (The compiler agent may write one for its own bookkeeping,
// but the TUI doesn't depend on it.)
package wikistate

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Freshness is a snapshot of wiki-vs-raw timestamps.
type Freshness struct {
	MostRecentRaw  time.Time // newest mtime in content/{notes,projects,communication}
	MostRecentWiki time.Time // newest mtime in content/wiki/
	NoContent      bool      // no raw files at all yet
	Empty          bool      // no wiki articles yet
}

// IsStale reports whether raw content is newer than the wiki.
func (f Freshness) IsStale() bool {
	if f.NoContent || f.Empty {
		return false
	}
	return f.MostRecentRaw.After(f.MostRecentWiki)
}

// StaleFor returns how far the wiki is behind; zero when not stale.
func (f Freshness) StaleFor() time.Duration {
	if !f.IsStale() {
		return 0
	}
	return f.MostRecentRaw.Sub(f.MostRecentWiki)
}

// Label is a short user-facing string for the header:
//
//	wiki: (kein content)   — no raw files under content/{notes,projects,comm}
//	wiki: leer             — no wiki files yet
//	wiki: aktuell          — wiki is at or ahead of raw
//	wiki: 2h stale         — wiki is behind raw by 2h
func (f Freshness) Label() string {
	switch {
	case f.NoContent:
		return "wiki: (kein content)"
	case f.Empty:
		return "wiki: leer"
	case !f.IsStale():
		return "wiki: aktuell"
	default:
		return "wiki: " + human(f.StaleFor()) + " stale"
	}
}

// Scan walks the relevant directories under myhubRoot and returns the
// snapshot. Safe on empty / missing directories.
func Scan(myhubRoot string) Freshness {
	raw := newestMtime(
		filepath.Join(myhubRoot, "content", "notes"),
		filepath.Join(myhubRoot, "content", "projects"),
		filepath.Join(myhubRoot, "content", "communication"),
	)
	wiki := newestMtime(filepath.Join(myhubRoot, "content", "wiki"))

	return Freshness{
		MostRecentRaw:  raw,
		MostRecentWiki: wiki,
		NoContent:      raw.IsZero(),
		Empty:          wiki.IsZero(),
	}
}

// newestMtime returns the latest mtime across all regular files under the
// given root directories. Skips dotfiles. Zero time if nothing found.
func newestMtime(roots ...string) time.Time {
	var newest time.Time
	for _, r := range roots {
		_ = filepath.Walk(r, func(_ string, info os.FileInfo, err error) error {
			if err != nil {
				return nil
			}
			if info.IsDir() {
				if strings.HasPrefix(info.Name(), ".") && info.Name() != "." {
					return filepath.SkipDir
				}
				return nil
			}
			if !info.Mode().IsRegular() {
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
	}
	return newest
}

func human(d time.Duration) string {
	switch {
	case d < time.Minute:
		return "<1m"
	case d < time.Hour:
		return fmt.Sprintf("%dm", int(d.Minutes()))
	case d < 24*time.Hour:
		return fmt.Sprintf("%dh", int(d.Hours()))
	default:
		return fmt.Sprintf("%dd", int(d.Hours()/24))
	}
}
