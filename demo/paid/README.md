# Lab Pro paid end-state — recorded envelope

This directory is the **paid end-state a buyer keeps**: one Lab Pro run that
started from papers, produced a checked claim, a wonder verdict, a researcher
sign-off, a BibTeX file and a Studio handoff — all inside the ≤ $20/mo SKU
(`lib/lab-plan.ts`). Raw Claude chat keeps none of these; that is the moat.

Recorded during the hackathon window from the generic paper flow (no canned
fixture, no paper-specific code). Replay without spending: paste any paper
below into `/paper` and follow the same steps.

| File | What it is | Produced by |
|---|---|---|
| `pro-run.json` | The run envelope: plan, claim, CHECK output, verdict, sign-off, citations, Studio files | `/paper` → History → Download |
| `references.bib` | One-click BibTeX of the run's open resources | Copy BibTeX (flow done panel / History) |
| `README.md` | This file | — |

## What Pro buys (recurring, per month)

- **25 metered Lab agent runs** (Free is a 2-run teaser) — `LAB_PLANS.pro.labRunsPerMonth`
- **Durable replay**: saved runs with claim, verdict, files, figures (`lib/history.ts`, `/history`)
- **Citations export**: platform BibTeX on Pro, local fallback otherwise (`cite_sources`)
- **HITL sign-off**: plan approval + verdict sign-off/challenge stamps that travel into Studio (`SavedRun.signoff`)
- **Studio files handoff**: claim + verdict + sign-off in the project description (`lib/handoff.ts`)
- **One bill**: every model call rides the Meta Model API on three tiers
  (contributor explore/edits, heavy first draft, wonder verdicts) — cents per run

## Replay (keys needed; UI needs none without them)

1. `cp .env.example .env.local`, fill `OPENIDEA_API_KEY` + `META_API_KEY`, `pnpm dev`.
2. Open `/paper`. Paste the multi-paper input from `pro-run.json` (`input`).
3. Agent path: `resolve_paper` (resolves both ids) → `search_open` →
   `expand_graph` → `set_plan` → `draft_code` → `run_sandbox` (browser runs
   `reproduce.py`) → `judge_paper` → `cite_sources` → `submit_prototype`.
4. Expect: sandbox log shows a `CHECK: pass` line with the measured number
   **and** a shuffled-baseline number; verdict `matches`/`partial` naming both;
   submit refuses until CHECK + baseline + verdict are all present
   (`lib/agent/verify/prototype.ts`).
5. Click **Sign off**, then **Copy BibTeX**, then **Open in Studio**.
   Expect: the stamp under the verdict, `@misc` entries pasting from
   `references.bib`, and a Studio project whose description carries the claim,
   verdict and sign-off.

## Cost bound

Same call counts as ever: 1–2 heavy (plan/draft), 1 contributor rank,
≤ 3 contributor fixes, 1 wonder verdict. Sign-off, BibTeX and the submit gate
are pure string handling — zero model calls. At list prices a run is cents,
so `META_CREDIT_USD=20` covers 40+ demo runs with the pause at 90%.
