package briefer

import (
	"os"
	"os/exec"
)

// DefaultVoice is the macOS `say` voice the TUI uses out-of-box.
const DefaultVoice = "Daniel"

// Speak reads text aloud via `say -v <voice>` in the background. No-op if:
//   - text or voice is empty,
//   - MYHUB_TTS env var is "0" (kill switch),
//   - the host lacks /usr/bin/say (non-macOS).
//
// Errors are swallowed by design — TTS is ambient; the TUI never blocks or
// surfaces errors from speech synthesis. Caller does not wait.
func Speak(text, voice string) {
	if text == "" || voice == "" {
		return
	}
	if os.Getenv("MYHUB_TTS") == "0" {
		return
	}
	sayBin, err := exec.LookPath("say")
	if err != nil {
		return
	}
	_ = exec.Command(sayBin, "-v", voice, text).Start()
}
