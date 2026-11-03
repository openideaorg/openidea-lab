# Pay judge iteration 7 — live Muse Wonder re-judge → YES

**Date:** 2026-11-03 (UTC)
**Mode:** live `muse-wonder-1.0` via the Meta Model API (shell `META_API_KEY`)
**Verdict:** **YES** · **score 80**
**Prior:** YES 78 (iter-6) → **YES 80** (iter-7)

## What changed (cheapest gap: no-GPU sandbox limits, stated per run)

The judge kept flagging the browser CPU sandbox. GPU is out of scope; the
no-infra answer is to make the scale-down explicit on every run so a
sample-scale pass is never read as the paper's own number.

- `lib/muse.ts` — draft prompt rule (8): the README must carry one `Scale:`
  line (paper setting vs this run's samples/dims/trials/seconds, ending with
  what the scaled-down run cannot show). `scaleFromReadme` extracts it with no
  model call; `draftNotebook` returns `scale` beside `claim`.
- `app/api/lab/plan/route.ts` — passes `scale` through.
- `app/flow.tsx` — verdict box shows "Scale, this run vs the paper: …", with
  a fixed honest fallback when the draft omitted the line; saved with the run;
  travels into the Studio handoff (`scaleLine`).
- `lib/agent/*`, `app/agent/page.tsx` — same line on `LabRun` and in the
  console header.
- `lib/history.ts`, `app/history/page.tsx` — rendered in History and in the
  markdown export under "Scale (this run vs the paper)".
- Landing bullet + paper page hint say CPU, sample-scale, README states cuts.
- Tests: `scaleFromReadme` (2), markdown export (1), handoff (extended);
  suite 106 tests.

## Why it moved (+2)

Per the judge: the buyer can "see exactly which paper settings were reduced
and what the sample-scale CPU run cannot prove in the verdict, console,
History, exports, and Studio handoff" — "a repeatable educational
reproduction tool rather than a paste-and-forget demo".

## Remaining gaps (judge-listed)

- No live checkout, subscribers, renewal or repeat-usage data.
- Scale line is draft-reported, not submit-gate enforced like CHECK;
  omissions only get the generic fallback. ← cheapest, next cycle.
- CPU sample-scale still cannot reproduce GPU / long-training claims.
- Sign-off browser-local; portability is manual files, not cloud sync.
- Photo: no quantified live segmentation accuracy.

## How to re-verify

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build   # all green, 106 tests
```

Raw judge JSON: `/tmp/pay-judge-iter-7.json` (YES 80).
Request: `/tmp/pay-judge-iter-7-req.json`.
