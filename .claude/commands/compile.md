---
description: "Force a wiki compile pass. Flags: --since=<duration>, --full (rebuild from scratch), --dry-run (preview only)."
---

Invoke the `compiler` agent. Pass through any user-provided flags.

## Special cases

**If `--full` is requested:** before running, confirm via Interview primitive (destructive-ish action):

- Vollständiger Rebuild — alle Wiki-Artikel neu erzeugen. Manuelle Edits im Wiki gehen verloren, Raw-Files sind unberührt.
- Zurück zu inkrementellem Compile *(Recommended)*
- Abbrechen

**If `--dry-run` is requested:** ask the agent to print its decision list (NEW / UPDATE / MERGE / ARCHIVE per source file) but not write anything.

## After the run

Print a one-line summary: `Wiki: N new · M updated · K archived · X files scanned · took Ys.`

If the compiler surfaced ambiguities (e.g., "file X could be a new article about Person Y or an update to Project Z"), present them as structured questions via the Interview primitive — one at a time, user picks.
