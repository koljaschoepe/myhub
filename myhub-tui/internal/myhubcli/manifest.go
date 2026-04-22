package myhubcli

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// Manifest is the on-disk shape of manifest.json: version, generation
// timestamp, map of relative-path → sha256hex.
type Manifest struct {
	SchemaVersion int               `json:"$schema_version"`
	GeneratedAt   string            `json:"generated_at"`
	Version       string            `json:"version"`
	Hashes        map[string]string `json:"hashes"`
}

// Paths covered by the manifest. Everything here is source-of-truth for
// the "what shipped" question — scripts, agent/command definitions, the
// two binaries, spec + docs. Deliberately excludes user data (content/,
// memory/ non-templates) and the Go toolchain (shipped as a separate
// blob) and build artifacts (myhub-tui/bin/).
var manifestRoots = []string{
	".boot",
	".claude",
	"bin",
	"content",
	"memory",
	"docs",
	"LICENSE",
	"README.md",
	"SPEC.md",
	"VERSION",
}

// skipPaths (relative to root) are excluded from the manifest even if
// they live inside a manifestRoot.
var skipPaths = map[string]bool{
	"bin/claude":                  true, // vendored external binary, hashed separately by Anthropic
	"bin/ollama":                  true,
	"bin/rg":                      true,
	"bin/fswatch":                 true,
	"bin/claude-arm64":            true,
	"bin/claude-x64":              true,
	".boot/trusted-hosts.json":    true, // host-specific, written by install
	".boot/dashboard-state.json":  true, // per-user TUI state
	".boot/assets/connect.aiff":   true, // placeholder — user picks one
	".boot/assets/icon.icns":      true,
	".claude/.credentials.json":   true, // OAuth secret, never hashed
	".claude/.claude.json":        true, // per-session state
	"memory/compile-state.json":   true, // written by compiler agent at runtime
	"memory/config.toml":          true, // written by /setup wizard at runtime
	"memory/projects.yaml":        true, // written by TUI registry at runtime
}

// hardSkipSubtrees are excluded entirely — the walker never descends into
// them. Use for high-volume per-user state (plugins, projects, session data).
var hardSkipSubtrees = []string{
	".claude/projects",
	".claude/todos",
	".claude/shell-snapshots",
	".claude/statsig",
	".claude/plugins",
	"memory/user",
	"memory/feedback",
	"memory/patterns",
	"memory/sessions",
	"memory/projects",
	"content/wiki/_archive",
}

// softSkipSubtrees are walked INTO, but by default every file inside is
// excluded from the manifest. The allowInsideSkipped allowlist re-adds
// specific template files so the shape (e.g. `content/notes/CLAUDE.md`)
// is pinned by the manifest even though user notes in the same dir are not.
// Wiki subdirs are soft-skipped so the compiler's generated articles don't
// drift the manifest; only the per-category CLAUDE.md templates are pinned.
var softSkipSubtrees = []string{
	"content/notes",
	"content/projects",
	"content/communication",
	"content/wiki/people",
	"content/wiki/projects",
	"content/wiki/concepts",
	"content/wiki/timeline",
}

var allowInsideSkipped = map[string]bool{
	"content/notes/CLAUDE.md":            true,
	"content/projects/CLAUDE.md":         true,
	"content/communication/CLAUDE.md":    true,
	"content/wiki/people/CLAUDE.md":      true,
	"content/wiki/projects/CLAUDE.md":    true,
	"content/wiki/concepts/CLAUDE.md":    true,
	"content/wiki/timeline/CLAUDE.md":    true,
}

// Manifesto builds a Manifest from the SSD at myhubRoot. Deterministic
// (sorted paths) so successive runs over the same state produce
// byte-identical output.
func Manifesto(args []string) int {
	fs := flag.NewFlagSet("myhub manifest", flag.ContinueOnError)
	out := fs.String("o", "", "output path (default: <root>/manifest.json)")
	printOnly := fs.Bool("stdout", false, "print to stdout, don't write")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	root := ResolveRoot()
	target := *out
	if target == "" {
		target = filepath.Join(root, "manifest.json")
	}

	m, err := buildManifest(root)
	if err != nil {
		fmt.Fprintln(os.Stderr, "myhub manifest:", err)
		return 1
	}
	data, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return 1
	}
	data = append(data, '\n')
	if *printOnly {
		_, _ = os.Stdout.Write(data)
		return 0
	}
	if err := writeFileAtomic(target, data, 0644); err != nil {
		fmt.Fprintln(os.Stderr, "myhub manifest:", err)
		return 1
	}
	fmt.Printf("✓ wrote %s (%d entries)\n", target, len(m.Hashes))
	return 0
}

// Verify reads the manifest at <root>/manifest.json and checks each
// hashed file. Exits 0 on match, 1 on any mismatch / missing file.
func Verify(args []string) int {
	fs := flag.NewFlagSet("myhub verify", flag.ContinueOnError)
	strict := fs.Bool("strict", false, "fail on extra (un-hashed) files too")
	_ = fs.Parse(args)
	root := ResolveRoot()
	path := filepath.Join(root, "manifest.json")

	raw, err := os.ReadFile(path)
	if err != nil {
		fmt.Fprintln(os.Stderr, "myhub verify:", err)
		return 1
	}
	var m Manifest
	if err := json.Unmarshal(raw, &m); err != nil {
		fmt.Fprintln(os.Stderr, "myhub verify: parse:", err)
		return 1
	}
	if len(m.Hashes) == 0 {
		fmt.Fprintln(os.Stderr, "myhub verify: manifest has no hashes — regenerate with `myhub manifest`")
		return 1
	}

	fmt.Printf("myhub verify — %s (%d entries, generated %s)\n\n", path, len(m.Hashes), m.GeneratedAt)

	ok := 0
	bad := 0
	missing := 0
	for rel, want := range m.Hashes {
		full := filepath.Join(root, rel)
		got, err := hashFile(full)
		if err != nil {
			fmt.Printf("  ✗ %s — missing (%v)\n", rel, err)
			missing++
			continue
		}
		if got != want {
			fmt.Printf("  ✗ %s — mismatch\n         want %s\n         got  %s\n", rel, want, got)
			bad++
			continue
		}
		ok++
	}
	fmt.Println()
	fmt.Printf("summary: %d ok · %d mismatched · %d missing\n", ok, bad, missing)
	if bad+missing > 0 {
		return 1
	}
	if *strict {
		// Walk the manifest roots and check for files NOT in the manifest.
		extras := findExtras(root, m)
		for _, e := range extras {
			fmt.Printf("  ! extra (not in manifest): %s\n", e)
		}
		if len(extras) > 0 {
			return 1
		}
	}
	fmt.Println("✓ all verified")
	return 0
}

func buildManifest(root string) (*Manifest, error) {
	hashes := make(map[string]string)
	for _, r := range manifestRoots {
		if err := walkForHashes(root, r, hashes); err != nil {
			return nil, err
		}
	}
	version := readVersion(root)
	// Sort-preserving serialization.
	keys := make([]string, 0, len(hashes))
	for k := range hashes {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	sorted := make(map[string]string, len(hashes))
	for _, k := range keys {
		sorted[k] = hashes[k]
	}
	return &Manifest{
		SchemaVersion: 1,
		GeneratedAt:   time.Now().UTC().Format(time.RFC3339),
		Version:       version,
		Hashes:        sorted,
	}, nil
}

func walkForHashes(root, sub string, out map[string]string) error {
	start := filepath.Join(root, sub)
	info, err := os.Stat(start)
	if err != nil {
		return nil // missing roots are fine
	}
	if !info.IsDir() {
		// Single file at top level (LICENSE, README.md, ...).
		rel, _ := filepath.Rel(root, start)
		h, herr := hashFile(start)
		if herr != nil {
			return herr
		}
		out[rel] = h
		return nil
	}
	return filepath.Walk(start, func(path string, info os.FileInfo, werr error) error {
		if werr != nil {
			return nil
		}
		rel, _ := filepath.Rel(root, path)
		if info.IsDir() {
			if inHardSkip(rel) {
				return filepath.SkipDir
			}
			return nil
		}
		if skipPaths[rel] {
			return nil
		}
		if inSoftSkip(rel) && !allowInsideSkipped[rel] {
			return nil
		}
		if strings.HasPrefix(filepath.Base(path), ".") && filepath.Base(path) != ".gitkeep" {
			return nil
		}
		h, err := hashFile(path)
		if err != nil {
			return err
		}
		out[rel] = h
		return nil
	})
}

func inHardSkip(rel string) bool {
	for _, s := range hardSkipSubtrees {
		if rel == s || strings.HasPrefix(rel, s+string(os.PathSeparator)) {
			return true
		}
	}
	return false
}

func inSoftSkip(rel string) bool {
	for _, s := range softSkipSubtrees {
		if rel == s || strings.HasPrefix(rel, s+string(os.PathSeparator)) {
			return true
		}
	}
	return false
}

func findExtras(root string, m Manifest) []string {
	var extras []string
	for _, r := range manifestRoots {
		_ = filepath.Walk(filepath.Join(root, r), func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return nil
			}
			rel, _ := filepath.Rel(root, path)
			if info.IsDir() {
				if inHardSkip(rel) {
					return filepath.SkipDir
				}
				return nil
			}
			if skipPaths[rel] {
				return nil
			}
			if inSoftSkip(rel) && !allowInsideSkipped[rel] {
				return nil
			}
			if strings.HasPrefix(filepath.Base(path), ".") && filepath.Base(path) != ".gitkeep" {
				return nil
			}
			if _, ok := m.Hashes[rel]; !ok {
				extras = append(extras, rel)
			}
			return nil
		})
	}
	sort.Strings(extras)
	return extras
}

func hashFile(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func readVersion(root string) string {
	b, err := os.ReadFile(filepath.Join(root, "VERSION"))
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(b))
}

func writeFileAtomic(path string, data []byte, mode os.FileMode) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, ".manifest.*.json.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Chmod(mode); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpPath, path)
}
