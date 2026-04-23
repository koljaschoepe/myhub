package myhubcli

import (
	"fmt"
	"os"
	"path/filepath"
)

// Stats walks the key content + memory directories and reports file counts
// plus total size. Quick, read-only.
func Stats(args []string) int {
	root := ResolveRoot()
	fmt.Printf("myhub stats — %s\n\n", root)

	targets := []string{
		"content/notes",
		"content/projects",
		"content/communication",
		"content/wiki",
		"memory",
	}
	fmt.Printf("  %-24s  %10s  %12s\n", "path", "files", "size")
	fmt.Printf("  %-24s  %10s  %12s\n", "----", "-----", "----")
	totalFiles := 0
	var totalBytes int64
	for _, t := range targets {
		s := walk(filepath.Join(root, t))
		fmt.Printf("  %-24s  %10d  %12s\n", t, s.count, human(s.bytes))
		totalFiles += s.count
		totalBytes += s.bytes
	}
	fmt.Printf("  %-24s  %10s  %12s\n", "----", "-----", "----")
	fmt.Printf("  %-24s  %10d  %12s\n", "total", totalFiles, human(totalBytes))
	return 0
}

type dirStats struct {
	count int
	bytes int64
}

func walk(root string) dirStats {
	var s dirStats
	_ = filepath.Walk(root, func(_ string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if !info.Mode().IsRegular() {
			return nil
		}
		s.count++
		s.bytes += info.Size()
		return nil
	})
	return s
}

func human(b int64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := int64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(b)/float64(div), "KMGTPE"[exp])
}
