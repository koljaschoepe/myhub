package myhubcli

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type trustedHost struct {
	UUID        string `json:"uuid"`
	InstalledAt string `json:"installed_at"`
}

type trustFile struct {
	Hosts []trustedHost `json:"hosts"`
}

// Trust adds this Mac's hardware UUID to .boot/trusted-hosts.json. Same
// effect as running install.command, but without touching launchd. Useful
// for a dev environment where the TUI is manually launched instead of
// mount-triggered.
func Trust(args []string) int {
	root := ResolveRoot()
	uuid, err := macUUID()
	if err != nil {
		fmt.Fprintln(os.Stderr, "myhub trust:", err)
		return 1
	}
	path := filepath.Join(root, ".boot", "trusted-hosts.json")

	var t trustFile
	if data, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(data, &t)
	}
	for _, h := range t.Hosts {
		if h.UUID == uuid {
			fmt.Printf("✓ Mac %s already trusted\n", uuid)
			return 0
		}
	}
	t.Hosts = append(t.Hosts, trustedHost{
		UUID:        uuid,
		InstalledAt: time.Now().UTC().Format(time.RFC3339),
	})

	out, err := json.MarshalIndent(t, "", "  ")
	if err != nil {
		fmt.Fprintln(os.Stderr, "myhub trust:", err)
		return 1
	}
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		fmt.Fprintln(os.Stderr, "myhub trust:", err)
		return 1
	}
	if err := os.WriteFile(path, out, 0600); err != nil {
		fmt.Fprintln(os.Stderr, "myhub trust:", err)
		return 1
	}
	fmt.Printf("✓ Mac %s added to trusted hosts\n", uuid)
	return 0
}

// macUUID reads the platform UUID from ioreg (same approach as
// .boot/install.command).
func macUUID() (string, error) {
	out, err := exec.Command("ioreg", "-rd1", "-c", "IOPlatformExpertDevice").Output()
	if err != nil {
		return "", fmt.Errorf("ioreg: %w", err)
	}
	for _, line := range strings.Split(string(out), "\n") {
		if !strings.Contains(line, "IOPlatformUUID") {
			continue
		}
		// Line form: `    "IOPlatformUUID" = "ABCDEF-...-"`
		parts := strings.Split(line, `"`)
		if len(parts) >= 4 {
			return parts[3], nil
		}
	}
	return "", fmt.Errorf("IOPlatformUUID not found in ioreg output")
}
