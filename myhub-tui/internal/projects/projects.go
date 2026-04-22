// Package projects manages the list of projects surfaced by the myhub TUI.
// The registry lives at memory/projects.yaml; the filesystem under
// content/projects/ is the primary source of truth.
package projects

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	"gopkg.in/yaml.v3"
)

// Project is a single entry in the hub's project list.
type Project struct {
	Name         string    `yaml:"name"`
	Path         string    `yaml:"path"`
	DisplayName  string    `yaml:"display_name,omitempty"`
	CreatedAt    time.Time `yaml:"created_at,omitempty"`
	LastOpenedAt time.Time `yaml:"last_opened_at,omitempty"`
	Favorite     bool      `yaml:"favorite,omitempty"`
	Archived     bool      `yaml:"archived,omitempty"`
	GitRemote    string    `yaml:"git_remote,omitempty"`
}

// Label returns the user-facing display name (falls back to Name).
func (p Project) Label() string {
	if p.DisplayName != "" {
		return p.DisplayName
	}
	return p.Name
}

// Registry is the on-disk project list plus its backing file path.
type Registry struct {
	Projects []Project `yaml:"projects"`
	path     string    `yaml:"-"`
}

// LoadRegistry reads from path. Missing file → empty registry, no error.
// Corrupted file → backup to <path>.bak.<timestamp> + empty registry (also
// no error) so the TUI never fails to boot on a bad registry.
func LoadRegistry(path string) (*Registry, error) {
	reg := &Registry{path: path}
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return reg, nil
	}
	if err != nil {
		return nil, err
	}
	if err := yaml.Unmarshal(data, reg); err != nil {
		ts := time.Now().UTC().Format("20060102T150405Z")
		_ = os.Rename(path, path+".bak."+ts)
		return &Registry{path: path}, nil
	}
	reg.path = path
	return reg, nil
}

// Save writes the registry atomically: tempfile → chmod 0600 → rename.
func (r *Registry) Save() error {
	data, err := yaml.Marshal(struct {
		Projects []Project `yaml:"projects"`
	}{Projects: r.Projects})
	if err != nil {
		return err
	}
	dir := filepath.Dir(r.path)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".projects.*.yaml.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	cleanup := func() { _ = os.Remove(tmpPath) }
	if _, err := tmp.Write(data); err != nil {
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
	return os.Rename(tmpPath, r.path)
}

// Scan walks contentProjectsDir and merges every subdirectory containing a
// CLAUDE.md or .myhub-project.toml into the registry. Projects whose
// directory no longer exists are marked Archived (not deleted — user may
// want to restore).
func (r *Registry) Scan(contentProjectsDir string) error {
	entries, err := os.ReadDir(contentProjectsDir)
	if err != nil {
		return err
	}

	found := make(map[string]string)
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		name := e.Name()
		path := filepath.Join(contentProjectsDir, name)
		if !hasProjectMarker(path) {
			continue
		}
		found[name] = path
		if i := r.indexOf(name); i >= 0 {
			// Already known — ensure path is current, un-archive if re-added.
			r.Projects[i].Path = path
			r.Projects[i].Archived = false
			continue
		}
		r.Projects = append(r.Projects, Project{
			Name:      name,
			Path:      path,
			CreatedAt: time.Now().UTC(),
		})
	}
	// Archive vanished.
	for i := range r.Projects {
		if _, ok := found[r.Projects[i].Name]; !ok {
			r.Projects[i].Archived = true
		}
	}
	r.sort()
	return nil
}

// Touch updates last_opened_at to now for the named project and saves.
func (r *Registry) Touch(name string) error {
	i := r.indexOf(name)
	if i < 0 {
		return fmt.Errorf("project %q not in registry", name)
	}
	r.Projects[i].LastOpenedAt = time.Now().UTC()
	r.sort()
	return r.Save()
}

// Active returns the non-archived projects in display order.
func (r *Registry) Active() []Project {
	out := make([]Project, 0, len(r.Projects))
	for _, p := range r.Projects {
		if !p.Archived {
			out = append(out, p)
		}
	}
	return out
}

func (r *Registry) indexOf(name string) int {
	for i, p := range r.Projects {
		if p.Name == name {
			return i
		}
	}
	return -1
}

// sort: most-recently-opened first, then alphabetically.
func (r *Registry) sort() {
	sort.SliceStable(r.Projects, func(i, j int) bool {
		a, b := r.Projects[i], r.Projects[j]
		if a.LastOpenedAt.Equal(b.LastOpenedAt) {
			return a.Name < b.Name
		}
		return a.LastOpenedAt.After(b.LastOpenedAt)
	})
}

func hasProjectMarker(dir string) bool {
	_, e1 := os.Stat(filepath.Join(dir, "CLAUDE.md"))
	_, e2 := os.Stat(filepath.Join(dir, ".myhub-project.toml"))
	return e1 == nil || e2 == nil
}
