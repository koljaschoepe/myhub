package briefer

import (
	"context"
	"strings"
	"testing"
	"time"
)

func TestFallbackContainsName(t *testing.T) {
	fb := Fallback("Kolja")
	if !fb.IsFallback {
		t.Error("Fallback should set IsFallback=true")
	}
	if !strings.Contains(fb.Text, "Kolja") {
		t.Errorf("fallback missing name: %q", fb.Text)
	}
	if fb.GeneratedAt.IsZero() {
		t.Error("GeneratedAt should be set")
	}
}

func TestFallbackEmptyName(t *testing.T) {
	fb := Fallback("")
	if strings.Contains(fb.Text, ", .") {
		t.Errorf("empty name produced stray comma: %q", fb.Text)
	}
}

func TestStaticBriefByHour(t *testing.T) {
	tests := []struct {
		hour int
		want string
	}{
		{8, "Guten Morgen"},
		{14, "Guten Tag"},
		{20, "Guten Abend"},
		{23, "Späte Session"},
	}
	for _, tt := range tests {
		ts := time.Date(2026, 4, 22, tt.hour, 0, 0, 0, time.UTC)
		got := staticBrief(ts, "Kolja")
		if !strings.HasPrefix(got, tt.want) {
			t.Errorf("hour %d: got %q, want prefix %q", tt.hour, got, tt.want)
		}
	}
}

func TestRunWithUnreachableClaude(t *testing.T) {
	// Empty root + empty PATH → resolveClaude fails → Fallback returned.
	t.Setenv("PATH", "")
	br := Run(context.Background(), t.TempDir(), "Kolja")
	if !br.IsFallback {
		t.Errorf("expected fallback, got %+v", br)
	}
	if br.Err == nil {
		t.Error("expected Err set when claude unreachable")
	}
}
