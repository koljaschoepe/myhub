package projects

import (
	"os"
	"path/filepath"
	"testing"
)

func TestScanAndRoundTrip(t *testing.T) {
	tmp := t.TempDir()
	contentProjects := filepath.Join(tmp, "content", "projects")

	// Two project dirs: one with CLAUDE.md, one with the toml marker, one
	// without markers (should NOT be picked up).
	mkProject(t, contentProjects, "alpha", "CLAUDE.md")
	mkProject(t, contentProjects, "beta", ".myhub-project.toml")
	if err := os.MkdirAll(filepath.Join(contentProjects, "no-marker"), 0755); err != nil {
		t.Fatal(err)
	}

	regPath := filepath.Join(tmp, "memory", "projects.yaml")
	reg, err := LoadRegistry(regPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := reg.Scan(contentProjects); err != nil {
		t.Fatal(err)
	}
	active := reg.Active()
	if len(active) != 2 {
		t.Fatalf("expected 2 active, got %d: %+v", len(active), active)
	}
	if err := reg.Save(); err != nil {
		t.Fatal(err)
	}

	// Round-trip.
	reg2, err := LoadRegistry(regPath)
	if err != nil {
		t.Fatal(err)
	}
	if len(reg2.Projects) != 2 {
		t.Fatalf("round-trip lost projects: %+v", reg2.Projects)
	}

	// Remove alpha's dir → scan should archive it.
	if err := os.RemoveAll(filepath.Join(contentProjects, "alpha")); err != nil {
		t.Fatal(err)
	}
	if err := reg2.Scan(contentProjects); err != nil {
		t.Fatal(err)
	}
	if len(reg2.Active()) != 1 {
		t.Fatalf("alpha should be archived, active=%+v", reg2.Active())
	}
}

func TestLoadCorruptedYAMLSelfHeals(t *testing.T) {
	tmp := t.TempDir()
	p := filepath.Join(tmp, "projects.yaml")
	if err := os.WriteFile(p, []byte("not: valid: yaml: ::\n"), 0600); err != nil {
		t.Fatal(err)
	}
	reg, err := LoadRegistry(p)
	if err != nil {
		t.Fatalf("LoadRegistry on corrupt file should not error, got %v", err)
	}
	if len(reg.Projects) != 0 {
		t.Errorf("expected empty registry on corrupt input, got %+v", reg.Projects)
	}
	// Backup exists.
	entries, _ := os.ReadDir(tmp)
	backed := false
	for _, e := range entries {
		if e.Name() != "projects.yaml" && filepath.Ext(e.Name()) != "" {
			backed = true
		}
	}
	if !backed {
		t.Errorf("expected a backup file next to %s, dir contents: %v", p, entries)
	}
}

func TestTouch(t *testing.T) {
	tmp := t.TempDir()
	contentProjects := filepath.Join(tmp, "content", "projects")
	mkProject(t, contentProjects, "gamma", "CLAUDE.md")

	reg, _ := LoadRegistry(filepath.Join(tmp, "memory", "projects.yaml"))
	_ = reg.Scan(contentProjects)
	if err := reg.Touch("gamma"); err != nil {
		t.Fatal(err)
	}
	got := reg.Active()[0]
	if got.LastOpenedAt.IsZero() {
		t.Error("LastOpenedAt should be non-zero after Touch")
	}
}

func mkProject(t *testing.T, base, name, marker string) {
	t.Helper()
	dir := filepath.Join(base, name)
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, marker), []byte("# test\n"), 0644); err != nil {
		t.Fatal(err)
	}
}
