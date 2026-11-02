#!/usr/bin/env bash
# Meta Model API → Claude Code (same pattern that worked in VS Code)
# Usage: source scripts/muse-claude-env.sh
# Or: MODEL_API_KEY=... source scripts/muse-claude-env.sh

set -euo pipefail

if [[ -z "${MODEL_API_KEY:-}" ]]; then
  if [[ -f .env.local ]] && grep -q '^META_API_KEY=' .env.local 2>/dev/null; then
    # shellcheck disable=SC1091
    MODEL_API_KEY="$(grep '^META_API_KEY=' .env.local | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
    export MODEL_API_KEY
  fi
fi

if [[ -z "${MODEL_API_KEY:-}" ]]; then
  echo "Set MODEL_API_KEY first, e.g.:"
  echo '  export MODEL_API_KEY="your_meta_key"'
  echo "  source scripts/muse-claude-env.sh"
  return 1 2>/dev/null || exit 1
fi

export ANTHROPIC_BASE_URL="https://api.meta.ai"
export ANTHROPIC_AUTH_TOKEN="$MODEL_API_KEY"
export ANTHROPIC_MODEL="muse-wonder-1.0"
export ANTHROPIC_DEFAULT_OPUS_MODEL="muse-wonder-1.0"
export ANTHROPIC_DEFAULT_SONNET_MODEL="muse-spark-1.3"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="muse-spark-1.3"
export CLAUDE_CODE_SUBAGENT_MODEL="muse-spark-1.3"
export ENABLE_TOOL_SEARCH="true"

# Ensure claude is on PATH
export PATH="$HOME/.local/bin:$PATH"

echo "Meta Claude Code env ready:"
echo "  ANTHROPIC_BASE_URL=$ANTHROPIC_BASE_URL"
echo "  ANTHROPIC_MODEL=$ANTHROPIC_MODEL"
echo "  PATH has claude: $(command -v claude || echo MISSING)"
echo "Run: claude"
