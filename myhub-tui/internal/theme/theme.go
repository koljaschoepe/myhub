// Package theme holds the visual identity of the myhub TUI.
// Palette, glyphs, and pre-built Lipgloss styles are inherited verbatim from
// OpenAra (github.com/koljaschoepe/OpenAra) so the two feel like cousins.
package theme

import (
	"time"

	"github.com/charmbracelet/lipgloss"
)

// Core colors.
var (
	Primary   = lipgloss.Color("#00d4ff")
	Secondary = lipgloss.Color("#5870ff")
	Success   = lipgloss.Color("#10b981")
	Warning   = lipgloss.Color("#f59e0b")
	Errorc    = lipgloss.Color("#ef4444")
	Dim       = lipgloss.Color("#6b7280")
	Fg        = lipgloss.Color("#e5e7eb")
)

// LogoGradient is the blue→indigo wash used for the ASCII logo. Seven steps.
var LogoGradient = []lipgloss.Color{
	"#00d4ff", "#10c0ff", "#20acff", "#3098ff",
	"#4088ff", "#4c7cff", "#5870ff",
}

// Glyphs inherited from OpenAra.
const (
	GlyphCheck    = "✓"
	GlyphCross    = "✗"
	GlyphDirty    = "*"
	GlyphDot      = "●"
	GlyphDotEmpty = "○"
	GlyphSep      = "·"
	GlyphArrow    = "→"
	GlyphBarFull  = "▰"
	GlyphBarEmpty = "▱"
)

// Pre-built styles.
var (
	Header           = lipgloss.NewStyle().Bold(true).Foreground(Primary)
	Subheader        = lipgloss.NewStyle().Foreground(Secondary)
	DimStyle         = lipgloss.NewStyle().Foreground(Dim)
	ProjectSelected  = lipgloss.NewStyle().Foreground(Primary).Bold(true)
	ProjectDefault   = lipgloss.NewStyle().Foreground(Fg)
	SuccessStyle     = lipgloss.NewStyle().Foreground(Success)
	WarningStyle     = lipgloss.NewStyle().Foreground(Warning)
	ErrorStyle       = lipgloss.NewStyle().Foreground(Errorc)
	RoundedBorderFg  = lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(Dim)
	PaddedPanel      = lipgloss.NewStyle().Padding(0, 2)
	LeftPad          = lipgloss.NewStyle().PaddingLeft(4)
)

// Greet returns a time-aware German greeting for the given clock and user
// name. If name is empty, no comma. The hour is expected in 0–23.
func Greet(now time.Time, name string) string {
	base := greetByHour(now.Hour())
	if name == "" {
		return base + "."
	}
	return base + ", " + name + "."
}

func greetByHour(h int) string {
	switch {
	case h >= 5 && h < 12:
		return "Guten Morgen"
	case h >= 12 && h < 17:
		return "Guten Tag"
	case h >= 17 && h < 22:
		return "Guten Abend"
	case h >= 22 || h < 2:
		return "Späte Session"
	default:
		return "Noch wach"
	}
}
