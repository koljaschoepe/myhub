package theme

import (
	"strings"
	"testing"
	"time"
)

func TestGreetByHour(t *testing.T) {
	tests := []struct {
		hour int
		want string
	}{
		{0, "Späte Session"},
		{1, "Späte Session"},
		{2, "Noch wach"},
		{8, "Guten Morgen"},
		{11, "Guten Morgen"},
		{12, "Guten Tag"},
		{16, "Guten Tag"},
		{17, "Guten Abend"},
		{21, "Guten Abend"},
		{22, "Späte Session"},
		{23, "Späte Session"},
	}
	for _, tt := range tests {
		if got := greetByHour(tt.hour); got != tt.want {
			t.Errorf("hour=%d: got %q, want %q", tt.hour, got, tt.want)
		}
	}
}

func TestGreet(t *testing.T) {
	morning := time.Date(2026, 4, 22, 8, 0, 0, 0, time.UTC)
	if got := Greet(morning, "Kolja"); !strings.HasPrefix(got, "Guten Morgen, Kolja") {
		t.Errorf("unexpected greeting: %q", got)
	}
	if got := Greet(morning, ""); got != "Guten Morgen." {
		t.Errorf("anonymous greeting: %q", got)
	}
}
