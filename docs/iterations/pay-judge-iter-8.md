# Pay judge iteration 8 — live Muse Wonder re-judge → YES (stop: ≥80 twice)

**Date:** 2026-11-03 (UTC)
**Mode:** live `muse-wonder-1.0` via the Meta Model API (shell `META_API_KEY`)
**Verdict:** **YES** · **score 82**
**Prior:** YES 80 (iter-7) → **YES 82** (iter-8). Two YES ≥ 80 in a row — the
wave's early-stop rule fires here.

## What changed (cheapest gap named by iter-7: Scale line was draft-reported)

Mirror the CHECK/baseline rule in code so the Scale line is structural, not
a courtesy of the draft.

- `lib/muse.ts` — `gateScale(verdict, readme)`: a `matches` with no `Scale:`
  line in the README is capped at `partial`; the judge's reason is kept and
  `missing` becomes `SCALE_MISSING` (the exact line to add). `verdict()`
  applies it after `parseVerdict`, so the one-shot flow and the agent's
  `judge_paper` both get it.
- `lib/agent/verify/prototype.ts` — paper submit refuses when neither
  `run.scale` nor the README carries a Scale line, with feedback naming it.
- Tests: `gateScale` (cap, pass-through, partial/no untouched) and submit
  gate (refusal; acceptance via README or extracted scale); suite 111 tests.

## Why it moved (+2)

Per the judge: "matches are now code-capped to partial without a Scale line
and submits are refused until it is added" — alongside the earlier evidence
this "clears $20/mo as a credible metered research-prototyping tool".

## Remaining gaps (judge-listed)

- No live checkout, paid cohort or willingness-to-pay test (out of scope
  for this wave by instruction).
- Paper-side settings in the Scale line are draft-reported, not verified
  against the source paper.
- CPU sample-scale tests shape only; GPU / long-training claims not reproduced.
- Local state + manual JSON portability; no identity or tamper-evident provenance.
- Evidence centres on one double-descent run type; SAM 3 accuracy unmeasured.

## Note on the build gate

One `pnpm build` failed with `Invariant: no direct app page entry found for
/_not-found` while `next dev` was running against the same `.next`; a rerun
passed. Stop the dev server before the build gate to avoid the race.

## How to re-verify

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build   # all green, 111 tests
```

Raw judge JSON: `/tmp/pay-judge-iter-8.json` (YES 82).
Request: `/tmp/pay-judge-iter-8-req.json`.
