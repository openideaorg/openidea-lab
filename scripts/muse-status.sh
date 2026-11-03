#!/usr/bin/env bash
# Snapshot the 3 Muse builder sessions → Project live-status board.
set -euo pipefail
TMUXC=(tmux -f /exec-daemon/tmux.portal.conf)
OUT="${MUSE_STATUS_OUT:-/cursor/stores/self/docs/live-status.md}"
JSON_OUT="${MUSE_STATUS_JSON:-/cursor/stores/self/docs/muse-sessions.json}"
NOW_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)
NOW_IST=$(python3 -c 'from datetime import datetime, timezone, timedelta; print((datetime.now(timezone.utc)+timedelta(hours=5,minutes=30)).strftime("%Y-%m-%d %H:%M IST"))')

session_state() {
  local name=$1 log=$2 repo=$3
  if ! "${TMUXC[@]}" has-session -t "$name" 2>/dev/null; then
    echo down; return
  fi
  if grep -q '^DONE_' "$log" 2>/dev/null; then
    echo finished; return
  fi
  if pgrep -af 'claude -p' 2>/dev/null | grep -F "$repo" >/dev/null; then
    echo working; return
  fi
  echo starting
}

last_out() {
  local log=$1
  if [[ ! -s "$log" ]]; then echo "(empty log)"; return; fi
  # Prefer non-warning content if present
  local line
  line=$(grep -vE 'unrecognized_model|doesn.t recognize the model|assumes a context window' "$log" 2>/dev/null | grep -v '^DONE_' | tail -1 || true)
  if [[ -z "${line// }" ]]; then
    line=$(tail -1 "$log" | head -c 180)
  fi
  echo "${line:0:180}"
}

prompt_job() {
  local f=$1
  head -c 220 "$f" 2>/dev/null | tr '\n' ' ' || echo "?"
}

declare -a NAMES=(muse-lab muse-graph muse-mcp)
declare -a REPOS=(/agent/repos/openidea-lab /agent/repos/openidea /agent/repos/openidea-mcp)
declare -a REPO_SHORT=(openidea-lab openidea openidea-mcp)
declare -a LOGS=(/tmp/muse-lab.log /tmp/muse-graph.log /tmp/muse-mcp.log)
declare -a PROMPTS=(/tmp/prompt-muse-lab.txt /tmp/prompt-muse-graph.txt /tmp/prompt-muse-mcp.txt)
declare -a MODELS=(muse-spark-1.3 muse-spark-1.3-contributor muse-spark-1.3-contributor)
declare -a JOBS=(
  "Lab build + pay YES (C1–C6)"
  "KG / research multi-paper + Lab handoff"
  "MCP resolve_paper / graph_neighbours / lab_handoff"
)

WD_ALIVE=no
"${TMUXC[@]}" has-session -t muse-watchdog 2>/dev/null && WD_ALIVE=yes
WD_TAIL=$(tail -3 /tmp/muse-watchdog.log 2>/dev/null | tr '\n' ' · ' | head -c 240 || echo none)

{
  echo "# Live status — Open Idea Lab Progress"
  echo
  echo "**Updated:** $NOW_IST"
  echo
  echo "## Judge"
  echo "Live Wonder: see docs/pay-judge-checkpoints.md (loop until YES)."
  echo
  echo "## Muse sessions (exactly 3)"
  echo "| Session | State | Working on | Repo / branch | Model | Log |"
  echo "|---|---|---|---|---|---|"
} >"$OUT"

json='['
engaged=0
for i in 0 1 2; do
  name=${NAMES[$i]}
  repo=${REPOS[$i]}
  short=${REPO_SHORT[$i]}
  log=${LOGS[$i]}
  model=${MODELS[$i]}
  job=${JOBS[$i]}
  branch=$(git -C "$repo" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')
  state=$(session_state "$name" "$log" "$repo")
  [[ "$state" == working || "$state" == starting ]] && engaged=$((engaged + 1))
  out=$(last_out "$log" | sed 's/|/\\|/g')
  printf '| `%s` | **%s** | %s | `%s` / `%s` | `%s` | `%s` |\n' \
    "$name" "$state" "$job" "$short" "$branch" "$model" "$log" >>"$OUT"
  echo "  - last: $out" >>"$OUT"
  if [[ $i -gt 0 ]]; then json+=','; fi
  # shellcheck disable=SC2016
  json+=$(printf '{"session":"%s","state":"%s","job":"%s","repo":"%s","branch":"%s","model":"%s","log":"%s","lastOut":%s}' \
    "$name" "$state" "$job" "$short" "$branch" "$model" "$log" "$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$out")")
done
json+=']'

{
  echo
  echo "## Watchdog"
  echo "- session: muse-watchdog ($WD_ALIVE)"
  echo "- last: $WD_TAIL"
  echo
  echo "## Watch"
  echo '```'
  echo 'tail -f /tmp/muse-lab.log /tmp/muse-graph.log /tmp/muse-mcp.log /tmp/muse-watchdog.log'
  echo '```'
  echo
  echo "Engaged: **$engaged/3** · Snapshot UTC: \`$NOW_UTC\`"
} >>"$OUT"

printf '%s\n' "{\"updatedAt\":\"$NOW_UTC\",\"updatedAtIst\":\"$NOW_IST\",\"engaged\":$engaged,\"watchdog\":\"$WD_ALIVE\",\"sessions\":$json}" >"$JSON_OUT"
echo "wrote $OUT ($engaged/3 engaged)"
echo "wrote $JSON_OUT"
