# Pay judge iteration 5 — live Muse Wonder re-judge → YES

**Date:** 2026-11-03 (UTC)
**Mode:** live `muse-wonder-1.0` via the Meta Model API (shell `META_API_KEY`)
**Verdict:** **YES** · **score 76**
**Prior:** YES 72 (iter-4b) → **YES 76** (iter-5)

## What changed (cheapest gap: metering/pricing clarity)

Buyer could see token counts but the ≤$20 price was asserted, not evidenced —
and one spend line (Baseten Spark Open fallback) was tracked in totals but
invisible on screen.

- `app/usage-panel.tsx` — renders the `basetenLlm` fallback row (was counted in
  the total, never shown) and a measured Pro-math line under every priced run:
  "This run: $X. Lab Pro (≤ $20/mo) covers ≈N runs like this." Unpriced runs
  fall back to the plan quota (25 metered runs/mo) instead of printing nothing.
- `lib/usage-types.ts` — pure `runsPerBudget(runCost, budget)` helper: floors,
  floors at one run, returns `undefined` for unknown/zero cost so the UI never
  prints nonsense.
- `tests/usage.test.ts` — fallback grouping + helper covered; suite now 101 tests.

## Why it moved (+4)

Per the judge: the per-run receipt makes Lab Pro credible "by showing measured
cost and 'covers approx N runs like this' math … rather than asserting it."

## Remaining gaps (judge-listed)

- Sample-scale in-browser sandbox, no GPU — compute-heavy papers excluded.
- Sign-off / saved runs are per-browser localStorage, not account-backed.
- No live checkout or paying-user evidence; intent inferred, not proven.

Note the photo-accuracy gap from iter-4 dropped off the list; the sandbox,
durability and conversion gaps remain.

## How to re-verify

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build   # all green, 101 tests
```

Raw judge JSON: `/tmp/pay-judge-iter-5.json` (YES 76).
Request: `/tmp/pay-judge-iter-5-req.json`.
