package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadMissingReturnsEmpty(t *testing.T) {
	c, err := Load(filepath.Join(t.TempDir(), "nope.toml"))
	if err != nil {
		t.Fatalf("Load missing: %v", err)
	}
	if !c.NeedsOnboarding() {
		t.Error("empty config should need onboarding")
	}
}

func TestRoundTrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.toml")
	c := &Config{
		User:   User{Name: "Kolja", Language: "Mix"},
		Editor: Editor{Default: "nvim"},
	}
	if err := Save(path, c); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode()&0177 != 0 {
		t.Errorf("config should be chmod 0600, got %v", info.Mode())
	}

	back, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if back.User.Name != "Kolja" || back.User.Language != "Mix" {
		t.Errorf("user round-trip: %+v", back.User)
	}
	if back.Editor.Default != "nvim" {
		t.Errorf("editor round-trip: %+v", back.Editor)
	}
	if back.NeedsOnboarding() {
		t.Error("filled config should NOT need onboarding")
	}
}

func TestLoadCorruptErrors(t *testing.T) {
	path := filepath.Join(t.TempDir(), "bad.toml")
	if err := os.WriteFile(path, []byte("this = is = not = toml"), 0600); err != nil {
		t.Fatal(err)
	}
	_, err := Load(path)
	if err == nil {
		t.Fatal("expected parse error on corrupt TOML")
	}
}
