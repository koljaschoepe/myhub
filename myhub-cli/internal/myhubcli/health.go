package myhubcli

import (
	"fmt"
	"os"
	"path/filepath"
)

// Health verifies the SSD has the expected file/dir structure and prints
// a per-check result. Exit 0 on all pass, 1 on any critical miss, 2 on
// warnings only.
func Health(args []string) int {
	root := ResolveRoot()
	fmt.Printf("myhub health — %s\n\n", root)

	critical := []check{
		{label: "claude binary (SSD)", path: filepath.Join(root, "bin", "claude"), kind: "exe"},
		{label: ".claude/ config dir", path: filepath.Join(root, ".claude"), kind: "dir"},
		{label: "content/ dir", path: filepath.Join(root, "content"), kind: "dir"},
		{label: "memory/ dir", path: filepath.Join(root, "memory"), kind: "dir"},
		{label: "memory/MEMORY.md", path: filepath.Join(root, "memory", "MEMORY.md"), kind: "file"},
		{label: "content/CLAUDE.md root map", path: filepath.Join(root, "content", "CLAUDE.md"), kind: "file"},
	}
	warnings := []check{
		{label: "myhub-tui binary", path: filepath.Join(root, "bin", "myhub-tui"), kind: "exe"},
		{label: "myhub CLI binary", path: filepath.Join(root, "bin", "myhub"), kind: "exe"},
		{label: "content/wiki/CLAUDE.md", path: filepath.Join(root, "content", "wiki", "CLAUDE.md"), kind: "file"},
		{label: "memory/config.toml", path: filepath.Join(root, "memory", "config.toml"), kind: "file"},
		{label: "tooling/go/bin/go", path: filepath.Join(root, "tooling", "go", "bin", "go"), kind: "exe"},
	}

	critFail := 0
	for _, c := range critical {
		if !c.ok() {
			critFail++
		}
	}
	warnFail := 0
	fmt.Println()
	fmt.Println("(warnings — non-critical but useful)")
	for _, c := range warnings {
		if !c.ok() {
			warnFail++
		}
	}

	fmt.Println()
	switch {
	case critFail > 0:
		fmt.Printf("✗ %d critical issue(s); %d warning(s)\n", critFail, warnFail)
		return 1
	case warnFail > 0:
		fmt.Printf("~ all critical checks passed; %d warning(s)\n", warnFail)
		return 2
	default:
		fmt.Println("✓ all checks passed")
		return 0
	}
}

type check struct {
	label string
	path  string
	kind  string // "file", "dir", "exe"
}

func (c check) ok() bool {
	info, err := os.Stat(c.path)
	if err != nil {
		fmt.Printf("  ✗ %-30s missing at %s\n", c.label+":", c.path)
		return false
	}
	switch c.kind {
	case "dir":
		if !info.IsDir() {
			fmt.Printf("  ✗ %-30s not a directory (%s)\n", c.label+":", c.path)
			return false
		}
	case "exe":
		if info.Mode()&0111 == 0 {
			fmt.Printf("  ✗ %-30s not executable (%s)\n", c.label+":", c.path)
			return false
		}
	case "file":
		if info.IsDir() {
			fmt.Printf("  ✗ %-30s is a directory (%s)\n", c.label+":", c.path)
			return false
		}
	}
	fmt.Printf("  ✓ %s\n", c.label)
	return true
}
