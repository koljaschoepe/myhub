# Voice — TTS for the Jarvis Moment

myhub reads the on-mount briefing aloud via macOS's `say` command. Default
voice: **Daniel** (British male, ships with macOS, closest in tone to the
Jarvis stereotype). Swappable to any system voice or, with a little
setup, to near-cinematic neural TTS.

## How it fires

1. On SSD mount, the TUI invokes the briefer agent headlessly (`claude -p
   --agent briefer`).
2. When the brief returns (2–4s), the TUI writes it to the "today" panel
   and fires `say -v <voice> "<brief text>" &` in the background.
3. TTS and UI are decoupled — the user is already picking a project while
   the voice catches up.

## Config (`memory/config.toml`)

```toml
[tts]
enabled = true
voice   = "Daniel"      # or Ava, Evan, Oliver, Anna, etc.
```

Set during onboarding; can be edited later. `tts.enabled = false` disables
speech entirely (text still renders in the TUI).

Per-session kill switch:

```bash
MYHUB_TTS=0 /Volumes/myhub/.boot/launcher.sh
```

## Upgrade paths

### 1. Premium neural voices (free, built-in)

macOS ships a handful of premium neural voices as optional downloads.
Higher quality than the default set, still via `say`.

- Open **Systemeinstellungen → Barrierefreiheit → Gesprochene Inhalte**.
- Click the voice list, look for entries tagged **"Premium"**.
- Download (~150 MB per voice).
- Point `memory/config.toml` at the new voice name.

No code changes, no extra binary. Biggest quality bump per minute of setup.

### 2. Piper TTS (local, high quality, offline)

[Piper](https://github.com/rhasspy/piper) is a lightweight neural TTS engine
(~50 MB binary + ~30–80 MB per voice model). Runs fully offline. Quality
lands between premium neural and ElevenLabs — very good for the cost.

Rough steps:

```bash
# From the SSD root:
mkdir -p bin/piper models/piper
curl -L https://github.com/rhasspy/piper/releases/latest/download/piper_macos_aarch64.tar.gz \
  | tar -xz -C bin/piper

# Pick a voice model — browse https://github.com/rhasspy/piper/blob/master/VOICES.md
curl -L https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alan/medium/en_GB-alan-medium.onnx \
  -o models/piper/en_GB-alan-medium.onnx
curl -L https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alan/medium/en_GB-alan-medium.onnx.json \
  -o models/piper/en_GB-alan-medium.onnx.json
```

Then override `tts.voice` in `config.toml` with a special prefix the TUI
understands as "pipe through Piper instead of `say`":

```toml
[tts]
enabled = true
voice   = "piper:en_GB-alan-medium"     # TUI maps this → piper --model ...
```

**Status:** Piper integration is on the Phase 5 backlog. Until then,
manual invocation works (`echo "..." | bin/piper/piper --model models/piper/....onnx --output-raw | afplay -`).

### 3. ElevenLabs (cloud, paid, true Jarvis-level)

The highest-quality option and the nearest to cinematic Jarvis tone. Costs
~$5–$22/month for enough credits to run the on-mount briefer indefinitely.

Planned integration (Phase 5): small helper at `bin/tts-elevenlabs` that
POSTs the brief to ElevenLabs and pipes the resulting MP3 to `afplay`.
API key lives at `memory/.elevenlabs-key` (mode 0600, .gitignore'd).

```toml
[tts]
enabled  = true
voice    = "elevenlabs:Bella"    # or Adam, Antoni, ...
```

## Picking a voice

- **Demo** before committing: `say -v Daniel "Guten Abend, Kolja. Lass uns anfangen."`
- List all installed voices: `say -v '?'`
- German voices that don't sound bored: Anna (premium), Petra (premium).
- British stand-ins for Jarvis beyond Daniel: Oliver (premium), Serena (premium).

## Why not just OpenAI TTS / Azure Neural / Google WaveNet?

All good. Implementation would follow the ElevenLabs pattern (a small
helper binary + API key on the SSD). Phase 5 backlog if you want to ship
a PR.

## Troubleshooting

- **No voice at mount, text renders fine:** `say` runs async — the TUI
  never blocks on TTS. Check that the voice name in `config.toml` matches
  an installed voice (`say -v '?'`). Non-existent names silently no-op.
- **Voice is installed but ignored:** make sure `tts.enabled = true` and
  `MYHUB_TTS` is not set to `0` in the shell that launched the TUI.
- **Wrong language pronunciation:** the Daniel voice is English-native
  and will pronounce German awkwardly. Swap to Anna/Petra for
  German-heavy briefings.
