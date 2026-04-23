// Package stats gathers cheap, always-on metrics for the TUI header and
// the on-demand full-stats modal. Every function here must be safe to call
// from the Bubble Tea Update loop — i.e. finish in a few milliseconds and
// never shell out. Expensive stats (du, git) live in the Expensive path
// which is only triggered by the `s` stats modal.
package stats

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"golang.org/x/sys/unix"
)

// Snapshot is the cheap, always-refreshed view of the SSD's state. Every
// field is zero-value safe, so a partial read (e.g. memory/ missing) still
// renders sensibly. Cost target: <20 ms total on a populated SSD.
type Snapshot struct {
	TakenAt      time.Time
	FreeBytes    uint64
	TotalBytes   uint64
	UsedBytes    uint64
	WikiArticles int
	MemoryItems  int
	Projects     int
	Sessions     int
	LastCompile  time.Time
	Uptime       time.Duration
	Trusted      bool
}

// Equal reports whether two snapshots have identical user-visible fields.
// Used to skip re-renders when a 5s tick produced the same data.
func (s Snapshot) Equal(o Snapshot) bool {
	return s.FreeBytes == o.FreeBytes &&
		s.TotalBytes == o.TotalBytes &&
		s.WikiArticles == o.WikiArticles &&
		s.MemoryItems == o.MemoryItems &&
		s.Projects == o.Projects &&
		s.Sessions == o.Sessions &&
		s.LastCompile.Equal(o.LastCompile) &&
		s.Trusted == o.Trusted
}

// UsedPct returns the SSD used percentage [0,1]. Zero if total is unknown.
func (s Snapshot) UsedPct() float64 {
	if s.TotalBytes == 0 {
		return 0
	}
	return float64(s.UsedBytes) / float64(s.TotalBytes)
}

// Collector is the reusable state for repeated snapshots. It caches the
// SSD startTime and the trust-check result (only the filesystem-walk stats
// are recomputed every tick).
type Collector struct {
	Root       string
	StartTime  time.Time
	ProjectCnt int // injected by caller; registry lives in the UI package
	trusted    *bool
}

// NewCollector returns a Collector rooted at myhubRoot; StartTime is
// captured now so Uptime is meaningful from the first snapshot onward.
func NewCollector(myhubRoot string) *Collector {
	return &Collector{Root: myhubRoot, StartTime: time.Now()}
}

// Capture assembles a Snapshot. Never returns an error: partial data is
// better than a failed render.
func (c *Collector) Capture() Snapshot {
	s := Snapshot{
		TakenAt:  time.Now(),
		Uptime:   time.Since(c.StartTime),
		Projects: c.ProjectCnt,
	}
	if total, free, ok := diskUsage(c.Root); ok {
		s.TotalBytes = total
		s.FreeBytes = free
		if total >= free {
			s.UsedBytes = total - free
		}
	}
	s.WikiArticles = countMarkdown(filepath.Join(c.Root, "content", "wiki"))
	s.MemoryItems = countMemoryItems(filepath.Join(c.Root, "memory"))
	s.Sessions = countSessions(filepath.Join(c.Root, ".claude", "projects"))
	s.LastCompile = readCompileState(filepath.Join(c.Root, "memory", "compile-state.json"))
	s.Trusted = c.isTrusted()
	return s
}

// diskUsage returns (total, free, ok) for the filesystem containing path.
// Zero + false when unix.Statfs fails (unsupported path, unmounted vol).
func diskUsage(path string) (uint64, uint64, bool) {
	var st unix.Statfs_t
	if err := unix.Statfs(path, &st); err != nil {
		return 0, 0, false
	}
	total := uint64(st.Blocks) * uint64(st.Bsize)
	free := uint64(st.Bavail) * uint64(st.Bsize)
	return total, free, true
}

// countMarkdown counts .md files beneath root, excluding hidden dirs and
// files that start with "_" (archive convention). Returns 0 on any walk
// error — stats should never kill the render.
func countMarkdown(root string) int {
	n := 0
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
		if strings.HasSuffix(info.Name(), ".md") && info.Name() != "CLAUDE.md" {
			n++
		}
		return nil
	})
	return n
}

// countMemoryItems counts top-level .md entries under memory/ other than
// MEMORY.md (which is the index, not an entry). Subdirectories are
// intentionally ignored — they're categories, not items.
func countMemoryItems(root string) int {
	entries, err := os.ReadDir(root)
	if err != nil {
		return 0
	}
	n := 0
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".md") {
			continue
		}
		if e.Name() == "MEMORY.md" {
			continue
		}
		n++
	}
	return n
}

// countSessions counts subdirectories under .claude/projects — one per
// Claude session history. Missing dir → 0.
func countSessions(root string) int {
	entries, err := os.ReadDir(root)
	if err != nil {
		return 0
	}
	n := 0
	for _, e := range entries {
		if e.IsDir() {
			n++
		}
	}
	return n
}

// readCompileState parses the `last_compile` field out of the compiler's
// state file. Missing / malformed → zero time (caller renders "—").
func readCompileState(path string) time.Time {
	data, err := os.ReadFile(path)
	if err != nil {
		return time.Time{}
	}
	// Naive parse — avoid adding json unmarshal for one field. Format:
	//   {"last_compile":"2026-04-22T23:37:16Z", ...}
	const key = `"last_compile"`
	idx := strings.Index(string(data), key)
	if idx < 0 {
		return time.Time{}
	}
	tail := string(data)[idx+len(key):]
	q1 := strings.Index(tail, `"`)
	if q1 < 0 {
		return time.Time{}
	}
	q2 := strings.Index(tail[q1+1:], `"`)
	if q2 < 0 {
		return time.Time{}
	}
	ts := tail[q1+1 : q1+1+q2]
	if t, err := time.Parse(time.RFC3339, ts); err == nil {
		return t
	}
	return time.Time{}
}

// isTrusted checks whether this Mac's hardware UUID appears in
// .boot/trusted-hosts.json. Result is cached for the lifetime of the
// Collector — the file doesn't change while the TUI runs.
func (c *Collector) isTrusted() bool {
	if c.trusted != nil {
		return *c.trusted
	}
	t := checkTrusted(c.Root)
	c.trusted = &t
	return t
}

func checkTrusted(myhubRoot string) bool {
	hostsPath := filepath.Join(myhubRoot, ".boot", "trusted-hosts.json")
	data, err := os.ReadFile(hostsPath)
	if err != nil {
		return false
	}
	uuid := macUUID()
	if uuid == "" {
		return false
	}
	return strings.Contains(string(data), uuid)
}

// macUUID returns this Mac's IOPlatformUUID via ioreg — same command the
// installer uses so the strings compare 1:1. Called once per Collector and
// cached in isTrusted's result. Empty string on non-darwin or if ioreg is
// missing (happens in `go test` sandboxes — trusted falls back to false).
func macUUID() string {
	if runtime.GOOS != "darwin" {
		return ""
	}
	out, err := exec.Command("ioreg", "-rd1", "-c", "IOPlatformExpertDevice").Output()
	if err != nil {
		return ""
	}
	// Line looks like: "IOPlatformUUID" = "ABCDEF12-3456-..."
	const key = `"IOPlatformUUID"`
	idx := strings.Index(string(out), key)
	if idx < 0 {
		return ""
	}
	tail := string(out)[idx+len(key):]
	q1 := strings.Index(tail, `"`)
	if q1 < 0 {
		return ""
	}
	q2 := strings.Index(tail[q1+1:], `"`)
	if q2 < 0 {
		return ""
	}
	return tail[q1+1 : q1+1+q2]
}
