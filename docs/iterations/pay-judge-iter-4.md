# Pay judge iteration 4 — live Muse Wonder re-judge → YES

**Date:** 2026-11-03 (UTC)
**Mode:** live `muse-wonder-1.0` via the Meta Model API (shell `META_API_KEY`)
**Verdict:** **YES** · **score 72**
**Prior:** NO 38 (iter-3) → NO 64 (iter-4a, same session) → **YES 72** (iter-4b)

## Why it flipped

The non-toy gate is now evidenced live, not asserted: a real double-descent run
produced `reproduce.py` + `README.md`, a falsifiable CHECK claim, and a Wonder
verdict citing measured numbers (0.21±0.02 vs shuffled baseline 0.34±0.02).
Multi-paper resolution (up to 5 sources), saved runs + one-click BibTeX +
sign-off travelling into Studio, and a token receipt making ≤$20 for ~40 runs
credible pushed it over the pay threshold. The same-session product pass closed
the two cheapest gaps: the photo flow is now directly usable in the agent
console (attach, `photo_upload` pause/resume, parts panel, no sandbox hop) and
buyer copy no longer leaks tier jargon.

## What changed since iter-3 (this branch, `muse/lab-post-merge-pass`)

- `segment_photo` as a first-class agent tool (C4) — `lib/agent/tools/index.ts`
- Multi-paper `resolve_paper`, non-toy submit gate (`CHECK` + null baseline),
  paid envelope (sign-off, BibTeX, Studio claim/verdict lines) — C1–C3
- Live E2E script `scripts/lab-e2e-meta.sh` — **GREEN** tonight: ping, search
  (6 ranked results), graph, plan (claim + notebook, ~17k heavy tokens),
  Wonder verdict `matches` (~1.5k tokens) — C5
- Baseten Spark Open opt-in fallback for draft/fix/rank (Meta failures only;
  verdicts stay on Wonder)
- Agent console photo kind + E2E 180s plan window (the 64→72 pass)

## Cost per run (live receipts, env-priced)

~3k contributor (rank) + ~17k heavy (draft) + ~1.5k wonder (verdict) = cents;
≤$20 covers ~40 demo runs. No GPU billed on cold-start 503s.

## Remaining gaps (judge-listed, out of tonight's scope)

- Sample-scale browser sandboxes, no GPU — excludes compute-heavy papers.
- Sign-off / saved runs are per-browser localStorage, not account-backed.
- Photo path lacks a quantified live accuracy/latency result like the paper verdict.
- No external paying cohort yet; ~55s heavy draft makes value depend on repeat use.

## How to re-verify

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build   # all green, 98 tests
BASE_URL=http://localhost:3000 ./scripts/lab-e2e-meta.sh # E2E GREEN
```

Raw judge JSON: `/tmp/pay-judge-c6b.json` (YES 72); prior NO: `/tmp/pay-judge-c6.json` (64).
Raw E2E responses: `/tmp/lab-e2e/` (`ping/search/graph/plan/verdict *.json`).
