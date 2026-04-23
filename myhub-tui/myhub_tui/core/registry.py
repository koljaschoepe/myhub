"""CommandSpec + Registry — ported from OpenAra's core/registry.py.

The `resolve()` method handles natural language (not just exact names):
exact match → multi-word alias → unique-prefix → fuzzy substring. The
app's dispatch loop uses it to route "open myhub", "/open myhub", or
just "myh" (if unambiguous) to the same handler.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

from myhub_tui.core.state import TuiState
from myhub_tui.core.types import CommandResult


CommandHandler = Callable[[TuiState, list[str]], CommandResult]


@dataclass
class CommandSpec:
    name: str
    handler: CommandHandler
    help_text: str = ""
    category: str = "Meta"
    subcommands: dict[str, str] | None = None
    aliases: list[str] = field(default_factory=list)


class Registry:
    """Command registry with natural-language resolve."""

    def __init__(self) -> None:
        self._commands: dict[str, CommandSpec] = {}
        self._alias_map: dict[str, str] = {}  # alias -> canonical name

    def register(self, spec: CommandSpec) -> None:
        self._commands[spec.name] = spec
        for alias in spec.aliases:
            self._alias_map[alias.lower()] = spec.name

    def get(self, name: str) -> CommandSpec | None:
        return self._commands.get(name)

    def names(self) -> list[str]:
        return sorted(self._commands.keys())

    def specs(self) -> list[CommandSpec]:
        return [self._commands[n] for n in self.names()]

    def categories(self) -> dict[str, list[CommandSpec]]:
        """Specs grouped by category, alphabetical within each."""
        cats: dict[str, list[CommandSpec]] = {}
        for spec in self.specs():
            cats.setdefault(spec.category or "Meta", []).append(spec)
        return cats

    # Convenience aliases matching my earlier surface.
    def all(self) -> list[CommandSpec]:
        return self.specs()

    def by_category(self) -> dict[str, list[CommandSpec]]:
        return self.categories()

    def resolve(self, text: str) -> tuple[CommandSpec | None, list[str]]:
        """Resolve natural language / command input to (spec, args).

        Order:
          1. Exact command name (first token).
          2. Multi-word alias (longest phrase first, up to 4 words).
          3. Unique prefix match on names.
          4. Fuzzy substring on names + aliases (queries ≥2 chars only).

        A leading slash is stripped on the first token.
        """
        head_raw, _, rest = text.strip().partition(" ")
        head_raw = head_raw.lstrip("/")
        normalized = f"{head_raw} {rest}".strip()
        words = normalized.lower().split()
        if not words:
            return None, []

        # 1. Exact name.
        spec = self._commands.get(words[0])
        if spec:
            return spec, words[1:]

        # 2. Multi-word alias (longest first).
        for length in range(min(len(words), 4), 0, -1):
            phrase = " ".join(words[:length])
            cmd_name = self._alias_map.get(phrase)
            if cmd_name:
                spec = self._commands.get(cmd_name)
                if spec:
                    args = words[length:]
                    if spec.subcommands and phrase in spec.subcommands:
                        args = [phrase] + args
                    return spec, args

        # 3. Unique prefix match.
        prefixes = [n for n in self._commands if n.startswith(words[0])]
        if len(prefixes) == 1:
            return self._commands[prefixes[0]], words[1:]

        # 4. Fuzzy substring (≥2 chars).
        if len(words[0]) >= 2:
            for word in words:
                if len(word) < 2:
                    continue
                for name, s in self._commands.items():
                    if word in name or name in word:
                        remaining = [w for w in words if w != word]
                        return s, remaining
                for alias, cmd_name in self._alias_map.items():
                    if word in alias.split():
                        s = self._commands.get(cmd_name)
                        if s:
                            remaining = [w for w in words if w != word]
                            if s.subcommands and word in s.subcommands:
                                remaining = [word] + remaining
                            return s, remaining

        return None, []


# Single global registry; populated by router.build_registry() at import.
REGISTRY = Registry()
