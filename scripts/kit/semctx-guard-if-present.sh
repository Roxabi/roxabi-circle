#!/usr/bin/env bash
# Forward PreToolUse stdin to the installed semctx guard. No-op if the plugin is absent.
# EXIT: 0 when the guard is missing (fail-open).
set -u

shopt -s nullglob
guards=()
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" && -f "${CLAUDE_PLUGIN_ROOT}/hooks/semctx-guard.mjs" ]]; then
  guards+=("${CLAUDE_PLUGIN_ROOT}/hooks/semctx-guard.mjs")
fi
guards+=(
  "$HOME/.grok/installed-plugins"/claude-code-*/plugins/claude-code/hooks/semctx-guard.mjs
  "$HOME/.claude/plugins/cache/semctx/semctx/"*/hooks/semctx-guard.mjs
)

guard=""
for candidate in "${guards[@]}"; do
  if [[ -f "$candidate" ]]; then
    guard="$candidate"
    break
  fi
done

[[ -n "$guard" && -x "$(command -v node)" ]] || exit 0
exec node "$guard"
