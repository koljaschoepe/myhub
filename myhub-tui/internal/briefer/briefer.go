// Package briefer generates the proactive on-mount greeting by invoking
// the briefer Claude Code agent headlessly (`claude -p --agent briefer`).
// On failure (no claude binary, timeout, empty output) it returns a static
// fallback so the dashboard is never left blank.
package briefer

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// Brief is the structured result of a briefer invocation.
type Brief struct {
	Text        string    // 2-5 lines of plain text, ready for display and TTS
	GeneratedAt time.Time // when Run() produced this brief
	IsFallback  bool      // true if we produced a static line because claude failed
	Err         error     // non-nil only when a real error was hit; Fallback uses IsFallback
}

// timeoutDefault is the hard ceiling on a briefer invocation. Keeps the
// dashboard from appearing stuck.
const timeoutDefault = 10 * time.Second

// Run spawns `claude -p --agent briefer` in the SSD context and returns the
// output. Uses timeoutDefault unless ctx carries a shorter deadline.
// CLAUDE_CONFIG_DIR is propagated so the SSD credentials are used.
// myhubRoot is used to resolve the binary (bin/claude preferred, $PATH fallback).
func Run(ctx context.Context, myhubRoot, userName string) Brief {
	binary, err := resolveClaude(myhubRoot)
	if err != nil {
		fb := Fallback(userName)
		fb.Err = err
		return fb
	}

	ctx, cancel := context.WithTimeout(ctx, timeoutDefault)
	defer cancel()

	cmd := exec.CommandContext(ctx, binary,
		"-p",
		"--agent", "briefer",
		"--output-format", "text",
		"Run brief now.",
	)
	cmd.Dir = myhubRoot
	cmd.Env = append(os.Environ(),
		"CLAUDE_CONFIG_DIR="+filepath.Join(myhubRoot, ".claude"),
		"MYHUB_ROOT="+myhubRoot,
	)

	out, err := cmd.Output()
	if err != nil {
		fb := Fallback(userName)
		fb.Err = err
		return fb
	}
	text := strings.TrimSpace(string(out))
	if text == "" {
		return Fallback(userName)
	}
	return Brief{Text: text, GeneratedAt: time.Now()}
}

// Fallback returns a static brief used when the briefer agent can't run.
// Greeting adapts to the hour (morning / afternoon / evening / late).
func Fallback(name string) Brief {
	return Brief{
		Text:        staticBrief(time.Now(), name),
		GeneratedAt: time.Now(),
		IsFallback:  true,
	}
}

func staticBrief(now time.Time, name string) string {
	greeting := greetByHour(now.Hour())
	if name != "" {
		greeting += ", " + name
	}
	greeting += "."
	return greeting + "\nmyhub verbunden. Lass uns weitermachen."
}

func greetByHour(h int) string {
	switch {
	case h >= 5 && h < 12:
		return "Guten Morgen"
	case h >= 12 && h < 17:
		return "Guten Tag"
	case h >= 17 && h < 22:
		return "Guten Abend"
	case h >= 22 || h < 2:
		return "Späte Session"
	default:
		return "Noch wach"
	}
}

func resolveClaude(myhubRoot string) (string, error) {
	ssdBin := filepath.Join(myhubRoot, "bin", "claude")
	if info, err := os.Stat(ssdBin); err == nil && info.Mode()&0111 != 0 {
		return ssdBin, nil
	}
	return exec.LookPath("claude")
}
