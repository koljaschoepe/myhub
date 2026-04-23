// Package main is the myhub maintenance CLI. Subcommands live in
// internal/myhubcli (Commands registry). Install as bin/myhub on the SSD;
// the launcher's PATH addition makes `myhub` available inside Claude Code
// sessions and from any SSD-local shell.
package main

import (
	"fmt"
	"os"

	"github.com/koljaschoepe/myhub/myhub-cli/internal/myhubcli"
)

func main() {
	if len(os.Args) < 2 {
		myhubcli.PrintHelp(os.Stdout)
		return
	}
	sub := os.Args[1]
	switch sub {
	case "help", "--help", "-h":
		myhubcli.PrintHelp(os.Stdout)
		return
	}
	for _, c := range myhubcli.Commands {
		if c.Name == sub {
			os.Exit(c.Run(os.Args[2:]))
		}
	}
	fmt.Fprintf(os.Stderr, "myhub: unknown command %q\n\n", sub)
	myhubcli.PrintHelp(os.Stderr)
	os.Exit(2)
}
