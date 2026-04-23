"""Claude-Code-style inline autocomplete for the myhub TUI.

Provides a prompt_toolkit Completer that:
- Shows all registered commands on empty input (Tab).
- Filters live as the user types (`complete_while_typing=True`).
- Handles `/slash` and bare natural-language input.
- Surfaces subcommands (e.g. `/git pull`) when the top command has them.
- Color-codes entries by category (Projects/AI/Git/System/Meta).
- Shows the help_text in the meta column on the right.
- Disables itself while a wizard is active (via ConditionalCompleter).

Ported from OpenAra's `SmartCompleter` pattern, adapted to myhub's
Registry surface.
"""

from __future__ import annotations

from collections.abc import Callable

from prompt_toolkit.completion import (
    Completer,
    Completion,
    ConditionalCompleter,
    FuzzyCompleter,
)
from prompt_toolkit.filters import Condition
from prompt_toolkit.formatted_text import HTML

from myhub_tui.core.registry import Registry


# Lowercase keyed because Registry categories come in capitalized
# ("Projects", "AI", …). The lookup is case-insensitive.
CATEGORY_STYLE = {
    "projects": "fg:ansigreen",
    "ai": "fg:ansimagenta",
    "git": "fg:#ff8800",
    "system": "fg:ansiyellow",
    "meta": "fg:ansiblue",
}


class MyhubCompleter(Completer):
    """Live command completer. Holds a reference to the Registry and an
    optional callable that lists project names (for future project-name
    completion on `/open …`).
    """

    def __init__(
        self,
        registry: Registry,
        project_lister: Callable[[], list[str]] | None = None,
    ) -> None:
        self.registry = registry
        self.project_lister = project_lister or (lambda: [])

    # prompt_toolkit will invoke this on every keystroke (or on Tab,
    # depending on PromptSession.complete_while_typing).
    def get_completions(self, document, complete_event):
        text = document.text_before_cursor.lstrip()

        # Empty input — show everything, alphabetical within each category
        # via Registry.specs().
        if not text:
            yield from self._all_commands(start=0)
            return

        if text.startswith("/"):
            yield from self._slash(text)
        else:
            yield from self._natural(text)

    # ------------------------------------------------------------------
    # Emission helpers
    # ------------------------------------------------------------------

    def _all_commands(self, start: int):
        for spec in self.registry.specs():
            yield self._make(spec, insert=f"/{spec.name}", start=start)

    def _slash(self, text: str):
        body = text[1:]
        parts = body.split()
        trailing_space = body.endswith(" ")

        # Top-level completion: user is still typing the command name.
        if len(parts) <= 1 and not trailing_space:
            prefix = parts[0] if parts else ""
            for spec in self.registry.specs():
                if spec.name.startswith(prefix) or any(
                    a.startswith(prefix) for a in spec.aliases
                ):
                    yield self._make(
                        spec,
                        insert=f"/{spec.name}",
                        start=-len(text),
                    )
            return

        # Subcommand completion: user typed `/git ` or `/git pu…`
        cmd = parts[0]
        spec = self.registry.get(cmd)
        if not spec:
            return
        if not spec.subcommands:
            # No subcommands known for this top-level — nothing to suggest.
            return
        sub_prefix = (
            parts[1] if (len(parts) >= 2 and not trailing_space) else ""
        )
        style = CATEGORY_STYLE.get((spec.category or "meta").lower(), "")
        for sub, desc in spec.subcommands.items():
            if sub.startswith(sub_prefix):
                yield Completion(
                    f"/{cmd} {sub}",
                    start_position=-len(text),
                    display=HTML(
                        f"<b>/{cmd}</b> <ansicyan>{sub}</ansicyan>"
                    ),
                    display_meta=desc,
                    style=style,
                )

    def _natural(self, text: str):
        q = text.lower()
        seen: set[str] = set()
        for spec in self.registry.specs():
            if spec.name in seen:
                continue
            # match name prefix or any alias prefix
            if spec.name.startswith(q) or any(a.startswith(q) for a in spec.aliases):
                seen.add(spec.name)
                yield self._make(spec, insert=spec.name, start=-len(text))

    def _make(self, spec, insert: str, start: int) -> Completion:
        style = CATEGORY_STYLE.get((spec.category or "meta").lower(), "")
        return Completion(
            insert,
            start_position=start,
            display=HTML(f"<b>{insert}</b>"),
            display_meta=spec.help_text or "",
            style=style,
        )


def build_completer(
    registry: Registry,
    project_lister: Callable[[], list[str]] | None,
    wizard_active: Callable[[], bool],
) -> ConditionalCompleter:
    """Produce the completer to hand to PromptSession.

    * FuzzyCompleter wraps our Completer — free substring/subsequence
      matching (typing "hlp" resolves to "/help").
    * ConditionalCompleter disables completion entirely while a wizard
      is active, so `/help` typed into a "Wie heißt Du?" prompt is not
      interpreted as a command suggestion.
    """
    inner = MyhubCompleter(registry, project_lister)
    fuzzy = FuzzyCompleter(inner)
    return ConditionalCompleter(fuzzy, Condition(lambda: not wizard_active()))
