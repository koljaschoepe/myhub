// Package launch hands the terminal to Claude Code for a per-project
// session and gets control back when Claude exits. Uses Bubble Tea's
// built-in tea.ExecProcess so alt-screen teardown + rebuild is handled by
// the framework (avoids nested-alt-screen conflicts with Claude's own UI).
package launch

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"

	tea "github.com/charmbracelet/bubbletea"
)

// ClaudeExitedMsg is delivered to the Bubble Tea model when the spawned
// `claude` process returns control.
type ClaudeExitedMsg struct {
	ProjectName string
	ProjectPath string
	Err         error
}

// Claude returns a tea.Cmd that execs `claude` with its cwd set to
// projectPath. The env is extended with:
//
//   - CLAUDE_CONFIG_DIR      — SSD's .claude/ dir (SSD autark auth)
//   - CLAUDE_CODE_PLUGIN_CACHE_DIR
//   - MYHUB_ROOT             — SSD root, for hooks
//   - MYHUB_PROJECT          — project slug, surfaced to SessionStart hook
//
// tea.ExecProcess pauses the TUI, hands the TTY to claude, and re-renders
// the dashboard after exit. When claude returns, the model receives a
// ClaudeExitedMsg (ok or error).
func Claude(myhubRoot, projectName, projectPath string) tea.Cmd {
	binary := resolveClaude(myhubRoot)
	cmd := exec.Command(binary)
	cmd.Dir = projectPath
	cmd.Env = append(os.Environ(),
		"CLAUDE_CONFIG_DIR="+filepath.Join(myhubRoot, ".claude"),
		"CLAUDE_CODE_PLUGIN_CACHE_DIR="+filepath.Join(myhubRoot, ".claude", "plugins"),
		"MYHUB_ROOT="+myhubRoot,
		"MYHUB_PROJECT="+projectName,
	)
	return tea.ExecProcess(cmd, func(err error) tea.Msg {
		return ClaudeExitedMsg{
			ProjectName: projectName,
			ProjectPath: projectPath,
			Err:         err,
		}
	})
}

// ErrBinaryNotFound is returned by Check when no claude binary is reachable.
var ErrBinaryNotFound = errors.New("claude binary not found on SSD or $PATH")

// Check confirms a usable claude binary exists. Returns its resolved path.
// Prefers the SSD-bundled bin/claude; falls back to $PATH.
func Check(myhubRoot string) (string, error) {
	ssdBin := filepath.Join(myhubRoot, "bin", "claude")
	if info, err := os.Stat(ssdBin); err == nil && info.Mode()&0111 != 0 {
		return ssdBin, nil
	}
	if found, err := exec.LookPath("claude"); err == nil {
		return found, nil
	}
	return "", ErrBinaryNotFound
}

// resolveClaude picks the SSD binary if present and executable; otherwise
// falls back to $PATH. If nothing is reachable, returns "claude" so the
// resulting exec fails loudly with a standard Go error the caller can
// surface — we don't invent a sentinel binary path.
func resolveClaude(myhubRoot string) string {
	if p, err := Check(myhubRoot); err == nil {
		return p
	}
	return "claude"
}
