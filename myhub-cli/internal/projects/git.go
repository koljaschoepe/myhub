package projects

import (
	"context"
	"os/exec"
	"strings"
	"sync"
	"time"
)

// GitInfo is a best-effort snapshot of a project's git state. Empty fields
// mean "not a git repo" or "git command unavailable".
type GitInfo struct {
	Branch     string // current branch (empty if detached or not a repo)
	Dirty      bool   // `git status --porcelain` produced output
	LastCommit string // relative time, e.g. "2 hours ago"
}

// Info runs the three cheap git commands in parallel against dir with a
// short timeout (2s) so a slow/broken repo never blocks the UI.
func Info(dir string) GitInfo {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	var g GitInfo
	var wg sync.WaitGroup

	wg.Add(3)
	go func() {
		defer wg.Done()
		g.Branch = runGit(ctx, dir, "symbolic-ref", "--short", "HEAD")
	}()
	go func() {
		defer wg.Done()
		g.Dirty = runGit(ctx, dir, "status", "--porcelain") != ""
	}()
	go func() {
		defer wg.Done()
		g.LastCommit = runGit(ctx, dir, "log", "-1", "--format=%cr")
	}()
	wg.Wait()
	return g
}

func runGit(ctx context.Context, dir string, args ...string) string {
	cmd := exec.CommandContext(ctx, "git", append([]string{"-C", dir}, args...)...)
	b, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(b))
}
