#!/usr/bin/env bash
# Keep 3–4 Muse Claude sessions always engaged on Lab / graph / MCP / pay-judge.
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
TMUXC=(tmux -f /exec-daemon/tmux.portal.conf)
LOG=/tmp/muse-watchdog.log
INTERVAL="${MUSE_WATCHDOG_INTERVAL:-90}"

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" | tee -a "$LOG"; }

muse_ok() {
  set -a; source "$HOME/.muse-meta-env" 2>/dev/null || true; set +a
  export ANTHROPIC_BASE_URL="${ANTHROPIC_BASE_URL:-https://api.meta.ai}"
  export ANTHROPIC_AUTH_TOKEN="${ANTHROPIC_AUTH_TOKEN:-$MODEL_API_KEY}"
  export ANTHROPIC_MODEL=muse-spark-1.3-contributor
  timeout 40 claude -p "Reply with exactly: MUSE_OK" --permission-mode bypassPermissions \
    >/tmp/muse-watchdog-ping.out 2>/tmp/muse-watchdog-ping.err \
    && grep -q MUSE_OK /tmp/muse-watchdog-ping.out
}

session_alive() {
  local name=$1
  "${TMUXC[@]}" has-session -t "$name" 2>/dev/null || return 1
  # finished if DONE_ in log and no claude -p for that session's cwd pattern
  return 0
}

claude_busy_for() {
  local needle=$1
  pgrep -af "claude -p" 2>/dev/null | grep -F "$needle" >/dev/null
}

launch() {
  local name=$1 cwd=$2 model=$3 promptfile=$4 logfile=$5
  "${TMUXC[@]}" kill-session -t "$name" 2>/dev/null || true
  local ENV_EXPORT="set -a; source ~/.muse-meta-env; set +a; set -a; source /agent/repos/openidea-lab/.env.local 2>/dev/null; set +a; export ANTHROPIC_BASE_URL=https://api.meta.ai; export ANTHROPIC_AUTH_TOKEN=\"\${MODEL_API_KEY:-\$META_API_KEY}\"; export ANTHROPIC_MODEL=$model; export ANTHROPIC_DEFAULT_OPUS_MODEL=muse-wonder-1.0; export ANTHROPIC_DEFAULT_SONNET_MODEL=muse-spark-1.3; export ANTHROPIC_DEFAULT_HAIKU_MODEL=muse-spark-1.3-contributor; export PATH=\"\$HOME/.local/bin:\$PATH\""
  "${TMUXC[@]}" new-session -d -s "$name" -c "$cwd" -- \
    bash -lc "$ENV_EXPORT; : > $logfile; claude -p \"\$(cat $promptfile)\" --permission-mode bypassPermissions 2>&1 | tee $logfile; echo DONE_\$? >> $logfile"
  log "launched $name ($model) in $cwd"
}

ensure_prompts() {
  cat >/tmp/prompt-muse-lab.txt <<'EOF'
You are the Lab Muse builder on /agent/repos/openidea-lab branch muse/lab-post-merge-pass. Model muse-spark-1.3.

RULES (strict):
1. Do NOT invent busywork. Assign yourself only the next REQUIRED task.
2. Order from /cursor/stores/self/docs/pay-judge-checkpoints.md: C1→C2→C3→C4→C5→C6. Skip a checkpoint only if already Done in that file or proven by tests.
3. Figure the next task yourself: read git status, failing tests, docs/iterations/*, and the lowest unfinished checkpoint that Lab owns (C1–C3, C5; C4 if photo gaps; C6 Wonder only after C5 green).
4. One focused change at a time. Do not break existing green paths (agent loop, Studio, ≤$20 Pro). Prefer fix over rewrite.
5. If nothing required is left for Lab this cycle, run the smallest relevant test suite and stop (write DONE note) — do not invent new features.
6. Commit+push only real progress. Stay in this session until that next required task ships or you prove it already done.
EOF
  cat >/tmp/prompt-muse-graph.txt <<'EOF'
You are the openidea KG/research Muse on /agent/repos/openidea branch muse/research-kg-post-merge. Prefer muse-spark-1.3-contributor.

RULES (strict):
1. Only the next REQUIRED task for multi-paper Lab handoff (checkpoint C1). No drive-by refactors.
2. Figure next work yourself from failing tests, Mentions/neighbourhood/resolve gaps, and Lab handoff APIs — pick the single blocker that unblocks C1.
3. Keep order: ingest correctness → resolve ≥2 papers → neighbourhood → Lab handoff. Do not break existing Transformer demo path.
4. If C1 graph side is already satisfied, run tests and stop — do not invent UI/feature work.
5. Commit+push only when the required step advances. Stay engaged until that step is done or proven done.
EOF
  cat >/tmp/prompt-muse-mcp.txt <<'EOF'
You are the openidea-mcp Muse on /agent/repos/openidea-mcp branch muse/mcp-post-merge. Prefer muse-spark-1.3-contributor.

RULES (strict):
1. Only next REQUIRED tool work that Lab/research already needs: resolve_paper, graph_neighbours, lab_handoff. No new tools unless a checkpoint is blocked without them.
2. Figure next task yourself from pytest failures and call-site gaps in Lab/openidea — one tool fix at a time, in that tool order.
3. Do not break existing MCP contracts or schemas. Prefer minimal diffs.
4. If tools already pass and Lab is unblocked, run pytest and stop — no polish for its own sake.
5. Commit+push only required progress. Stay engaged until that step ships or is proven done.
EOF
  cat >/tmp/prompt-muse-judge.txt <<'EOF'
Pay-judge only after C5 is green. Read pay-judge-checkpoints.md. If C5 not green, do nothing but note blockers. If C5 green, run muse-wonder-1.0 pay-judge once; on NO list gaps only (Lab builder owns fixes). No unnecessary coding.
EOF
}

ensure_alive() {
  local name=$1 cwd=$2 model=$3 prompt=$4 logf=$5 needle=$6
  if claude_busy_for "$needle" || { "${TMUXC[@]}" has-session -t "$name" 2>/dev/null && ! grep -q '^DONE_' "$logf" 2>/dev/null; }; then
    log "$name engaged"
    return
  fi
  # Clean stop (agent decided nothing required) — do not invent another task.
  if grep -q '^DONE_0' "$logf" 2>/dev/null; then
    log "$name finished cleanly (DONE_0) — leave stopped; no busywork relaunch"
    return
  fi
  log "$name idle/error — relaunch"
  launch "$name" "$cwd" "$model" "$prompt" "$logf"
}

ensure_prompts
log "watchdog PARALLEL x3 start interval=${INTERVAL}s"
while true; do
  if muse_ok; then
    log "muse UP — ensure 3 builders"
    ensure_alive muse-lab /agent/repos/openidea-lab muse-spark-1.3 /tmp/prompt-muse-lab.txt /tmp/muse-lab.log "Lab builder"
    ensure_alive muse-graph /agent/repos/openidea muse-spark-1.3-contributor /tmp/prompt-muse-graph.txt /tmp/muse-graph.log "openidea KG"
    ensure_alive muse-mcp /agent/repos/openidea-mcp muse-spark-1.3-contributor /tmp/prompt-muse-mcp.txt /tmp/muse-mcp.log "openidea-mcp"
    /agent/repos/openidea-lab/scripts/muse-status.sh >/tmp/muse-status.out 2>&1 || true
  else
    log "muse DOWN — wait"
  fi
  sleep "$INTERVAL"
done
