// Package config holds the persistent user preferences used by the myhub
// TUI: name, language, default editor. Serialized as TOML at
// memory/config.toml (per SPEC §11.1).
package config

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/BurntSushi/toml"
)

// User captures identity-level prefs.
type User struct {
	Name     string `toml:"name,omitempty"`
	Language string `toml:"language,omitempty"`
}

// Editor is the preferred text editor (opened by project-detail 'e' key,
// and passed to Claude Code via the EDITOR env var if needed).
type Editor struct {
	Default string `toml:"default,omitempty"`
}

// Config is the top-level shape of memory/config.toml.
type Config struct {
	User   User   `toml:"user"`
	Editor Editor `toml:"editor"`
}

// NeedsOnboarding reports whether the first-run wizard should fire. Name
// is the anchor: an empty name means the user has never completed /setup.
func (c *Config) NeedsOnboarding() bool {
	return c == nil || c.User.Name == ""
}

// Path returns the canonical location of config.toml relative to the SSD root.
func Path(myhubRoot string) string {
	return filepath.Join(myhubRoot, "memory", "config.toml")
}

// Load reads config.toml at path. Missing → empty Config, no error. Parse
// errors bubble up so the caller can decide (the dashboard surfaces them
// as a notice rather than crashing).
func Load(path string) (*Config, error) {
	var c Config
	_, err := toml.DecodeFile(path, &c)
	if err != nil {
		if os.IsNotExist(err) {
			return &c, nil
		}
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	return &c, nil
}

// Save writes c to path atomically (temp file, chmod 0600, rename). Parent
// directory is created as needed.
func Save(path string, c *Config) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".config.*.toml.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	cleanup := func() { _ = os.Remove(tmpPath) }

	enc := toml.NewEncoder(tmp)
	if err := enc.Encode(c); err != nil {
		tmp.Close()
		cleanup()
		return err
	}
	if err := tmp.Chmod(0600); err != nil {
		tmp.Close()
		cleanup()
		return err
	}
	if err := tmp.Close(); err != nil {
		cleanup()
		return err
	}
	return os.Rename(tmpPath, path)
}
