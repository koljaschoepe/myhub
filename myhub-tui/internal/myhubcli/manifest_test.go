package myhubcli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// mkTree builds a minimal SSD-like directory tree for manifest tests.
func mkTree(t *testing.T, root string, files map[string]string) {
	t.Helper()
	for rel, body := range files {
		full := filepath.Join(root, rel)
		if err := os.MkdirAll(filepath.Dir(full), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(body), 0644); err != nil {
			t.Fatal(err)
		}
	}
}

func TestBuildManifestIsDeterministic(t *testing.T) {
	tmp := t.TempDir()
	mkTree(t, tmp, map[string]string{
		"VERSION":                             "0.1.0-test\n",
		"README.md":                           "# readme\n",
		"LICENSE":                             "MIT\n",
		".boot/launcher.sh":                   "#!/bin/bash\necho ok\n",
		".claude/settings.json":               `{"permissions":{}}`,
		".claude/agents/compiler.md":          "---\nname: compiler\n---\nprompt",
		"content/CLAUDE.md":                   "# root",
		"content/notes/CLAUDE.md":             "# notes",
		"content/notes/real-user-note.md":     "ignored: inside user data subtree",
		"memory/MEMORY.md":                    "# memory",
		"memory/user/private.md":              "ignored: user-learned",
		".claude/.credentials.json":           `{"secret":"nope"}`, // must be skipped
	})

	m1, err := buildManifest(tmp)
	if err != nil {
		t.Fatal(err)
	}
	m2, err := buildManifest(tmp)
	if err != nil {
		t.Fatal(err)
	}

	j1, _ := json.Marshal(m1.Hashes)
	j2, _ := json.Marshal(m2.Hashes)
	if string(j1) != string(j2) {
		t.Error("manifest should be deterministic across builds")
	}

	// Must include templates + scripts.
	for _, want := range []string{
		"README.md",
		"LICENSE",
		"VERSION",
		".boot/launcher.sh",
		".claude/settings.json",
		".claude/agents/compiler.md",
		"content/CLAUDE.md",
		"content/notes/CLAUDE.md",
		"memory/MEMORY.md",
	} {
		if _, ok := m1.Hashes[want]; !ok {
			t.Errorf("manifest missing expected entry %q", want)
		}
	}

	// Must EXCLUDE user data + secrets.
	for _, notWant := range []string{
		"content/notes/real-user-note.md",
		"memory/user/private.md",
		".claude/.credentials.json",
	} {
		if _, ok := m1.Hashes[notWant]; ok {
			t.Errorf("manifest should exclude %q but included it", notWant)
		}
	}

	// Version was picked up.
	if m1.Version != "0.1.0-test" {
		t.Errorf("version: got %q, want 0.1.0-test", m1.Version)
	}
}

func TestHashFileStable(t *testing.T) {
	tmp := t.TempDir()
	p := filepath.Join(tmp, "x")
	if err := os.WriteFile(p, []byte("hello\n"), 0644); err != nil {
		t.Fatal(err)
	}
	h1, err := hashFile(p)
	if err != nil {
		t.Fatal(err)
	}
	h2, _ := hashFile(p)
	if h1 != h2 {
		t.Error("hash changed across reads")
	}
	// Known SHA-256 of "hello\n".
	want := "5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03"
	if !strings.EqualFold(h1, want) {
		t.Errorf("hash mismatch: %s vs %s", h1, want)
	}
}

func TestVerifyDetectsTampering(t *testing.T) {
	tmp := t.TempDir()
	mkTree(t, tmp, map[string]string{
		"VERSION":           "1.0.0",
		"README.md":         "hello",
		".boot/launcher.sh": "#!/bin/bash\n",
	})
	// Generate a manifest and save it.
	t.Setenv("MYHUB_ROOT", tmp)
	if code := Manifesto(nil); code != 0 {
		t.Fatalf("Manifesto exit %d", code)
	}
	// Tamper with a file.
	if err := os.WriteFile(filepath.Join(tmp, "README.md"), []byte("tampered"), 0644); err != nil {
		t.Fatal(err)
	}
	// Verify must fail.
	if code := Verify(nil); code == 0 {
		t.Error("Verify should have failed on tampered README")
	}
}
