# Lab iteration — Muse post-merge Lab Pro hardening (2026-11-02)

Model: `muse-spark-1.3` for all code and prose. No escalation.

## Starting point

Branch `muse/lab-post-merge-pass` sat on top of `main` (`b1ffe0f`) with a
conflicted stash pop: **7 files** with conflict markers (`PARTNERS.md`,
`app/page.tsx`, `docs/ARCHITECTURE.md`, `lib/muse.ts`, plus no-marker
divergences in `.env.example`, `app/layout.tsx`, `lib/env.ts`).
Two Muse clients had grown in parallel:

- `main`: thin `lib/muse.ts` on the `routeMuseModel` router
  (`lib/muse-models.ts` + `lib/muse-agent.ts` + `lib/agent/` loop).
- stash: full `lib/muse.ts` (3 tiers via `modelFor`) with the pay-iter-4
  hardenings — null-baseline rule, `claim` handoff, `claimFromReadme`,
  hardened `verdict` + `parseVerdict`, `sanitizeFiles`.

## Resolution (why)

Every one-shot route (`/api/lab/plan|search|fix|verdict|segment`) imports the
**full** API (`rank`, `fix`, `verdict`, `draftNotebook` → `{files, claim}`,
`FixAttempt`, `LabelledPart`…), and `tests/muse.test.ts` pins it. The thin
router-only `muse.ts` would have broken all of them. So:

- `lib/muse.ts` — kept the full client (= stash), removed one stray marker.
  The router stays too: `lib/muse-agent.ts` + `lib/agent/` + `lib/muse-models.ts`
  are untouched and only take a `GeneratedFile` *type* from `lib/muse.ts`.
- `app/layout.tsx` — already matched `main` (Agent nav first, Muse-only
  footer). Nothing to do.
- `lib/env.ts` — kept the 3-tier shape the client reads
  (`META_MODEL` / `_HEAVY` / `_WONDER`); `modelFor` reads them live.
- `.env.example` — kept the tier block + Lab packaging, **re-added** the
  commented `META_MODEL_<ROLE>` / `META_MODEL_FORCE_ALL` router overrides so
  the kept router stays documented (repo rule: every variable listed).
- `PARTNERS.md`, `app/page.tsx`, `docs/ARCHITECTURE.md` — kept `main`'s
  agent-loop framing (Lab Agent primary, one-shot flows marked legacy,
  Muse-only hero). One correction while there: the layout table described
  `muse.ts` as "plan/draft" only — now says what it is
  (plan/draft/rank/fix/label/verdict, tiered).

## Fixes the gates caught

- `tests/muse.test.ts`, `tests/handoff.test.ts` — stray closing braces from
  the stash (files did not parse). Re-wrapped / removed; suite is green.
- `pnpm typecheck` — `lib/agent/tools/index.ts` still used the thin
  `draftNotebook` shape (`run.files = files.value`). Fixed **and** closed a
  real pay-judge gap: the agent loop judged the raw paste, while the one-shot
  flow judges the drafted claim. `LabRun` gains optional `claim`, `draftCode`
  stores `drafted.value.claim`, and `judge_paper` judges
  `run.claim ?? input` and reports the claim in its observation so the console
  shows what was actually judged.

## Payability (closes pay-judge NO 38 driver in the agent loop too)

The NO was toy claim checks: a check that runs without a falsifiable claim,
no CHECK line, no baseline. The one-shot path already requires all three;
now the agent loop does as well — same `draftNotebook` prompt (null baseline
+ CHECK + README claim), same "judge the drafted claim" rule. No paper-specific
code anywhere; no new model calls (claim travels in existing observations).

Deliberately not changed: challenge-without-note, per-browser sign-off,
photo canvas drawing all boxes (carried over, stated in UI/docs).

## How to test

Gates (all four pass in this session, no keys needed):

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Unit: `tests/muse.test.ts` (`modelFor` tiers, `claimFromReadme`,
`parseVerdict`, `sanitizeFiles`), `tests/muse-models.test.ts` (router table),
`tests/handoff.test.ts` (judgement under the cap), `tests/runner.test.ts`
(`errorFingerprint` spinner lines). 14 files / 73 tests green.

Manual (keys needed; same three-paper protocol as pay-iter-4 §How to test):

1. `cp .env.example .env.local`, fill `OPENIDEA_API_KEY` + `META_API_KEY`.
2. `/paper` — double descent: expect CHECK + shuffled-baseline numbers,
   verdict `matches`/`partial` naming both, `To strengthen:` line when capped.
3. `/agent` — same paper through the agent loop: console shows the drafted
   claim, `judge_paper` verdict references that sentence, not the paste.
4. Flow done panel + `/history`: Sign off / Challenge stamp, Copy BibTeX,
   Studio handoff description carries claim + verdict + sign-off.
5. Toy regression: "compute one-head attention weights and print them" —
   verdict caps at `partial`, `missing` names CHECK/baseline.
6. `/` shows the Pro strip; no flow lists Fireworks under "Needs".
