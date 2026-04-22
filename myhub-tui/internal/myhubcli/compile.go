package myhubcli

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/koljaschoepe/myhub/myhub-tui/internal/launch"
)

// Compile invokes the compiler agent headlessly. Flags:
//   --since <duration>   incremental since <duration> (e.g. 2d, 4h)
//   --full               full rebuild from scratch
//   --dry-run            print decisions, don't write
func Compile(args []string) int {
	fs := flag.NewFlagSet("myhub compile", flag.ContinueOnError)
	since := fs.String("since", "", "incremental window (e.g. 2d, 4h)")
	full := fs.Bool("full", false, "full rebuild — overwrites wiki, raw untouched")
	dryRun := fs.Bool("dry-run", false, "print decisions, don't write")
	if err := fs.Parse(args); err != nil {
		return 2
	}

	root := ResolveRoot()
	claude, err := launch.Check(root)
	if err != nil {
		fmt.Fprintln(os.Stderr, "myhub compile:", err)
		fmt.Fprintln(os.Stderr, "       (expected bin/claude on the SSD or claude on $PATH)")
		return 1
	}

	prompt := "run incremental compile"
	switch {
	case *full:
		prompt = "run full compile — rebuild every wiki article from raw sources"
	case *since != "":
		prompt = fmt.Sprintf("run incremental compile since %s", *since)
	}
	if *dryRun {
		prompt += " (DRY RUN — print the decision list, do not write files)"
	}

	fmt.Printf("myhub compile — prompt: %q\n", prompt)

	// 5-minute ceiling. Long enough for a full rebuild; safe bail-out if
	// the agent hangs.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(ctx, claude,
		"-p",
		"--agent", "compiler",
		"--output-format", "text",
		prompt,
	)
	cmd.Dir = root
	cmd.Env = append(os.Environ(),
		"CLAUDE_CONFIG_DIR="+filepath.Join(root, ".claude"),
		"MYHUB_ROOT="+root,
	)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	start := time.Now()
	if err := cmd.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "myhub compile: %v\n", err)
		return 1
	}
	fmt.Printf("\ncompiler finished in %s\n", time.Since(start).Round(time.Millisecond))
	return 0
}
