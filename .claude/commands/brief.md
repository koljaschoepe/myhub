---
description: Regenerate the proactive on-mount briefing mid-session.
---

Invoke the `briefer` agent with the current state (same as mount-time flow). Print the result.

If invoked from inside a Claude session (not the TUI), after printing the brief, offer a structured follow-up via the Interview primitive:

- Fortsetzen mit einem der offenen Fäden
- Zu einem anderen Projekt wechseln (returns to TUI)
- Zurück zur aktuellen Aufgabe *(Recommended)*

Never block on TTS — if the user is inside a session, skip audio.
