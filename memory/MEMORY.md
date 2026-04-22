# myhub memory index

This file is the always-loaded index of persistent memory. Claude Code reads
it at every session start. Keep entries to one line each: pointer + hook.

Each entry below is a link to a file under `memory/{user,feedback,patterns,projects,sessions}/`.
Each linked file has frontmatter (`name`, `description`, `type`) and typically 1-5 paragraphs
of content.

## Index

<!--
New entries are appended by /reflect and the SessionEnd hook.
Do not bulk-rewrite this file — it should grow additively, like a ledger.
Remove or update individual entries when they become wrong or stale.
-->

<!-- (empty — /reflect and SessionEnd will populate as you work) -->
