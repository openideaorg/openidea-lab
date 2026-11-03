#!/usr/bin/env bash
# Point Claude Code at Anthropic + Fable (Cursor models locked / unused).
# Source before `claude`:  source scripts/claude-anthropic-fable-env.sh
set -euo pipefail

# Prefer explicit Anthropic key; never fall back to Meta gateway for this mode.
if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  # optional local file (gitignored): ~/.anthropic-env
  if [[ -f "$HOME/.anthropic-env" ]]; then
    # shellcheck disable=SC1090
    set -a; source "$HOME/.anthropic-env"; set +a
  fi
fi

if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "ANTHROPIC_API_KEY missing. Add sk-ant-… to env or ~/.anthropic-env" >&2
  return 1 2>/dev/null || exit 1
fi

# Real Anthropic API (not Meta Muse gateway)
unset ANTHROPIC_AUTH_TOKEN MODEL_API_KEY || true
export ANTHROPIC_BASE_URL="${ANTHROPIC_BASE_URL:-https://api.anthropic.com}"
export ANTHROPIC_API_KEY

# Fable via Cursor model id when Claude Code accepts it; else Sonnet as API-safe default.
# Override with FABLE_MODEL=claude-fable-5-1|medium|low|max|xhigh
FABLE_MODEL="${FABLE_MODEL:-claude-fable-5-1}"
export ANTHROPIC_MODEL="$FABLE_MODEL"
export ANTHROPIC_DEFAULT_OPUS_MODEL="$FABLE_MODEL"
export ANTHROPIC_DEFAULT_SONNET_MODEL="$FABLE_MODEL"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="${ANTHROPIC_DEFAULT_HAIKU_MODEL:-claude-haiku-4-5-20251001}"
export PATH="$HOME/.local/bin:$PATH"

echo "Claude Code → Anthropic ($ANTHROPIC_BASE_URL) model=$ANTHROPIC_MODEL (Cursor models locked)"
