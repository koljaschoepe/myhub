#!/usr/bin/env bash
# PreToolUse hook: block Edit/Write of files that introduce direct API SDK imports.
#
# Default code paths must use the `claude` CLI subprocess (subscription-billed),
# not the Anthropic / OpenAI SDKs (API-billed). This hook enforces that.
#
# Allowlist override: a file may contain `arasul:allow-api-sdk` in any comment
# line; the hook then permits the edit. Use sparingly and only with a clear
# justification on the same line.
#
# Hook contract:
#   stdin  = JSON with .tool_name, .tool_input.file_path, .tool_input.content,
#            .tool_input.new_string
#   stdout = JSON with permissionDecision: allow|deny + reason on deny
#   exit 0 = allow, exit 2 = blocking deny

set -euo pipefail

INPUT=$(cat)
TOOL=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""')

# Only fire on Edit and Write.
if [[ "$TOOL" != "Edit" && "$TOOL" != "Write" ]]; then
  exit 0
fi

PATH_TARGET=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // ""')

# Skip directories we don't own.
case "$PATH_TARGET" in
  */node_modules/*|*/.claude/plugins/*|*/runtime/*|*/target/*|*/dist/*|*/.venv/*|*/__pycache__/*)
    exit 0
    ;;
esac

# Pull the candidate text: Write uses .content, Edit uses .new_string.
NEW_CONTENT=$(printf '%s' "$INPUT" | jq -r '.tool_input.content // .tool_input.new_string // ""')

# Allowlist marker — if present anywhere in the new content, permit.
if printf '%s' "$NEW_CONTENT" | grep -qE 'arasul:allow-api-sdk'; then
  exit 0
fi

# Forbidden import patterns. Each branch matches the language idiom we'd see.
PATTERNS=(
  # Python
  '^[[:space:]]*import[[:space:]]+anthropic([[:space:]]|$|\.)'
  '^[[:space:]]*from[[:space:]]+anthropic[[:space:]]+import'
  '^[[:space:]]*import[[:space:]]+openai([[:space:]]|$|\.)'
  '^[[:space:]]*from[[:space:]]+openai[[:space:]]+import'
  # TypeScript / JavaScript
  "from[[:space:]]+['\"]@anthropic-ai/(sdk|anthropic)['\"]"
  "from[[:space:]]+['\"]openai['\"]"
  "require\\(['\"]@anthropic-ai/(sdk|anthropic)['\"]\\)"
  "require\\(['\"]openai['\"]\\)"
  # Rust
  '^[[:space:]]*use[[:space:]]+anthropic_sdk(::|;)'
  '^[[:space:]]*use[[:space:]]+anthropic(::|;)'
  '^[[:space:]]*use[[:space:]]+openai_api_rust(::|;)'
)

for pattern in "${PATTERNS[@]}"; do
  if printf '%s' "$NEW_CONTENT" | grep -qE "$pattern"; then
    REASON="Blocked: file would introduce a direct API SDK import that bypasses the user's Claude subscription. Use the \`claude\` CLI subprocess instead (interactive PTY or \`claude -p\` headless). If this is a deliberate, audited exception, add a comment line containing 'arasul:allow-api-sdk' with a one-line justification, then re-run."
    jq -n --arg r "$REASON" '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: $r
      }
    }'
    exit 2
  fi
done

exit 0
