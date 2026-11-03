#!/usr/bin/env bash
# Live META_API_KEY end-to-end: paper → graph → plan → verdict → cite → Studio.
#
# Usage:
#   BASE_URL=http://localhost:3000 ./scripts/lab-e2e-meta.sh [paper-text-file]
#
# Needs: META_API_KEY in the environment (server reads it via lib/env.ts —
# never echoed, never committed). OPENIDEA_API_KEY must be set server-side
# for search/graph/extract; without it those steps report 424 and the script
# continues to the Muse-only steps.
#
# The sandbox step is client-side by design (Pyodide runs in the browser), so
# this script exercises the verdict with a canned CHECK+baseline output that a
# real browser run prints — the same strings the submit gate requires.
set -u
BASE="${BASE_URL:-http://localhost:3000}"
OUT="${LAB_E2E_OUT:-/tmp/lab-e2e}"
mkdir -p "$OUT"

fail=0
say() { printf '%s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }
jget() { python3 -c "import json,sys; d=json.load(open('$1')); print($2)" 2>/dev/null || echo "?"; }

if [ -z "${META_API_KEY:-}" ]; then
  say "META_API_KEY is not set in this shell. Export it (Cursor / Claude Code Muse configuration) and re-run."
  exit 2
fi

say "== 1/6 Muse ping (contributor tier, no spend beyond a pong) =="
META_API_URL="${META_API_URL:-https://api.meta.ai/v1}"
META_MODEL="${META_MODEL:-muse-spark-1.3-contributor}"
code=$(curl -s -o "$OUT/ping.json" -w '%{http_code}' "$META_API_URL/chat/completions" \
  -H "Authorization: Bearer $META_API_KEY" -H 'Content-Type: application/json' \
  -d "{\"model\":\"$META_MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply with the single word pong.\"}],\"max_tokens\":16}")
if [ "$code" != "200" ]; then say "ping FAILED ($code): $(head -c 300 "$OUT/ping.json")"; fail=1; else
  say "ping ok ($META_MODEL): $(python3 -c "import json; d=json.load(open('$OUT/ping.json')); print((d.get('choices') or [{}])[0].get('message',{}).get('content','?').strip()); print('usage:', d.get('usage'))" 2>/dev/null)"
fi

PAPER_TEXT=""
if [ "${1:-}" != "" ]; then PAPER_TEXT=$(cat "$1"); fi
if [ -z "$PAPER_TEXT" ]; then PAPER_TEXT="Double descent (Belkin et al. 2019): on synthetic least-squares data the test error peaks at the interpolation threshold n=d and then falls. Reproduce the peak position with a shuffled-label baseline."; fi
# escape for JSON via python3
QTEXT=$(python3 -c 'import json,sys; print(json.dumps(open(sys.argv[1]).read()))' <(printf '%s' "$PAPER_TEXT"))

say "== 2/6 search (platform key server-side; 424 without it) =="
code=$(curl -s -o "$OUT/search.json" -w '%{http_code}' -X POST "$BASE/api/lab/search" \
  -H 'Content-Type: application/json' -d '{"query":"double descent test error interpolation threshold","keep":6}')
say "search -> $code"
if [ "$code" = "200" ]; then
  python3 - "$OUT/search.json" <<'EOF'
import json,sys
d=json.load(open(sys.argv[1]))
vals=d.get('value') or []
print(f"results: {len(vals)}")
for r in vals[:6]: print(f"- [{r.get('type')}] {r.get('title')} ({r.get('url')})")
print('usage:', d.get('usage'))
EOF
else head -c 300 "$OUT/search.json"; echo; fi

say "== 3/6 graph neighbourhood =="
python3 - "$OUT/search.json" > "$OUT/graph-body.json" <<'EOF' 2>/dev/null || echo '{"resources":[]}' > "$OUT/graph-body.json"
import json,sys
d=json.load(open(sys.argv[1]))
vals=(d.get('value') or [])[:6]
print(json.dumps({"resources":[{"id":r.get('id',r.get('url','')),"type":r.get('type','paper'),"title":r.get('title',''),"url":r.get('url','')} for r in vals]}))
EOF
code=$(curl -s -o "$OUT/graph.json" -w '%{http_code}' -X POST "$BASE/api/lab/graph" \
  -H 'Content-Type: application/json' -d @"$OUT/graph-body.json")
say "graph -> $code $(head -c 200 "$OUT/graph.json")"

say "== 4/6 plan + draft (Muse heavy: the paper reproduction) =="
python3 - "$OUT/search.json" > "$OUT/plan-body.json" <<EOF 2>/dev/null || echo '{"kind":"paper","text":"x","context":[]}' > "$OUT/plan-body.json"
import json
d=json.load(open("$OUT/search.json"))
vals=(d.get('value') or [])[:6]
ctx=[{"id":r.get('id',r.get('url','')),"type":r.get('type','paper'),"title":r.get('title',''),"url":r.get('url','')} for r in vals]
print(json.dumps({"kind":"paper","text":$QTEXT,"context":ctx}))
EOF
code=$(curl -s -o "$OUT/plan.json" -w '%{http_code}' --max-time 180 -X POST "$BASE/api/lab/plan" \
  -H 'Content-Type: application/json' -d @"$OUT/plan-body.json")
say "plan -> $code"
if [ "$code" = "200" ]; then
  python3 - "$OUT/plan.json" <<'EOF'
import json,sys
d=json.load(open(sys.argv[1]))
v=d.get('value') or {}
print('claim:', v.get('claim'))
print('files:', [f.get('path') for f in v.get('files',[])])
print('usage:', d.get('usage'))
EOF
else head -c 300 "$OUT/plan.json"; echo; fail=1; fi

say "== 5/6 verdict (Muse wonder: CHECK + baseline output, as a browser run prints) =="
python3 - "$OUT/plan.json" > "$OUT/verdict-body.json" <<'EOF' 2>/dev/null || echo '{}' > "$OUT/verdict-body.json"
import json
try:
    d=json.load(open("$OUT/plan.json"))
    v=(d.get('value') or {})
    claim=v.get('claim') or 'Test error peaks at the interpolation threshold n=d then falls.'
    files={f.get('path',''):f.get('content','') for f in v.get('files',[])}
    readme=files.get('README.md','')[:6000]
except Exception:
    claim='Test error peaks at the interpolation threshold n=d then falls.'
    readme=''
body={"claim":claim,"readme":readme,
 "output":"n=d peak at threshold (test err 0.21+-0.02 vs shuffled baseline 0.34+-0.02, 20 trials, seed 0)\nCHECK: pass peak at n=d, main 0.21 beats shuffled baseline 0.34 outside SE"}
print(json.dumps(body))
EOF
code=$(curl -s -o "$OUT/verdict.json" -w '%{http_code}' --max-time 25 -X POST "$BASE/api/lab/verdict" \
  -H 'Content-Type: application/json' -d @"$OUT/verdict-body.json")
say "verdict -> $code $(head -c 400 "$OUT/verdict.json")"
echo
[ "$code" = "200" ] || fail=1

say "== 6/6 cite + Studio (operator steps, no spend here) =="
say "- Copy BibTeX: /paper done panel or /history (platform export on Pro, local fallback)."
say "- Studio: POST $BASE/api/lab/studio with your openidea.world apiKey + claim/verdictLine/signoffLine."
say "  Responses saved in $OUT (ping/search/graph/plan/verdict *.json)."

if [ "$fail" = "0" ]; then say "E2E GREEN: Muse ping + plan + verdict all 200."; else say "E2E RED: see above."; exit 1; fi
