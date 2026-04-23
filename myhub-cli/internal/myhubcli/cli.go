// Package myhubcli implements the subcommands behind the `myhub` maintenance
// CLI binary (separate from the interactive TUI). Surfaces operations the
// user runs occasionally: recompile the wiki, verify the SSD's structure,
// report on-drive statistics, register this Mac as trusted.
package myhubcli

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// Command is one subcommand in the CLI. Run returns a shell exit code.
type Command struct {
	Name    string
	Summary string
	Run     func(args []string) int
}

// Commands is the full registry, used by cmd/myhub/main.go for dispatch
// and by PrintHelp for auto-generated help output.
var Commands = []Command{
	{"compile", "recompile content/wiki/ articles via the compiler agent", Compile},
	{"health", "verify the SSD has the expected structure + binaries", Health},
	{"stats", "report file counts and sizes under content/ + memory/", Stats},
	{"trust", "register this Mac as trusted in .boot/trusted-hosts.json", Trust},
	{"manifest", "generate manifest.json (SHA-256 over scripts + binaries + templates)", Manifesto},
	{"verify", "verify the SSD against manifest.json; exit 1 on any mismatch", Verify},
}

// ResolveRoot picks the SSD root from MYHUB_ROOT → binary location → cwd.
func ResolveRoot() string {
	if r := os.Getenv("MYHUB_ROOT"); r != "" {
		return r
	}
	if exe, err := os.Executable(); err == nil {
		if abs, err := filepath.EvalSymlinks(exe); err == nil {
			return filepath.Dir(filepath.Dir(abs))
		}
	}
	cwd, _ := os.Getwd()
	return cwd
}

// PrintHelp writes auto-generated help text listing every subcommand.
func PrintHelp(w io.Writer) {
	fmt.Fprintln(w, "myhub — maintenance CLI for the myhub SSD")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Usage: myhub <command> [args...]")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Commands:")
	for _, c := range Commands {
		fmt.Fprintf(w, "  %-10s  %s\n", c.Name, c.Summary)
	}
	fmt.Fprintln(w, "  help        show this help")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "For command-specific help: myhub <command> --help")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Env: MYHUB_ROOT overrides auto-detected SSD root.")
}
