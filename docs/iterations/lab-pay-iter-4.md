# Lab iteration — pay-iter-4: non-toy claim checks + Pro value (2026-11-02)

Model: `muse-spark-1.3` for all code and prose (per instructions, wonder only for architecture notes — none needed here).
No escalation: nothing here needed heavy reasoning beyond the edits themselves.

## Starting point

Live Muse Wonder pay-judge on iter-3 returned **NO, score 38**. The iter-3 note itself lives outside
this repo (`/cursor/stores/self/docs/iterations/pay-judge-iter-3.md`) and could not be opened from
this workspace, so this pass works from the brief: the failure was (1) toy claim checks — the paid
demo's `attention_toy.py` (deleted with the agent loop, was on
`origin/cursor/paid-lab-demo-pay-judge-6e48` as `lib/demo/paid-transformer-fixture.ts`) printed a 4×4
attention matrix with **no falsifiable claim, no CHECK line, no baseline**, and a self-awarded
`partial`; (2) recurring Pro value a buyer could not tell apart from pasting into raw Claude.

## What changed and why

### 1. Claim checks that a toy cannot pass (the NO driver)

- `lib/muse.ts` — `draftNotebook` prompt now requires a **null baseline** next to the main experiment
  (same script on shuffled/permuted labels), printed beside the main number. A claim passes only if it
  beats the baseline outside the standard error; the README must state the baseline and the numeric
  pass criterion. "It runs" is explicitly not a reproduction.
- `lib/muse.ts` — `verdict` prompt hardened: `matches` needs **both** a `CHECK: pass` line with the
  measured number **and** a baseline comparison the claim beats. Shape-right-but-unchecked caps at
  `partial`. The verdict also returns `missing`: the single extra check that would raise it.
  Parsing moved to pure `parseVerdict()` (unit-tested) so a malformed verdict fails loudly instead of
  rendering an empty box.
- Multi-paper, not attention-only: the machinery was already paper-agnostic; what was missing was
  proof. Test steps below run **three different papers** through the same CHECK + baseline + verdict
  path — no paper-specific code anywhere.

### 2. Pro value a buyer can point at (vs raw Claude)

| Pro artifact | Where it lives | Raw Claude keeps… |
|---|---|---|
| Saved runs (claim, verdict, files, figures) | `lib/history.ts`, `/history` | nothing |
| Verdict line + `missing` under every figure | `app/flow.tsx` | nothing |
| Researcher sign-off / challenge (HITL stamp) | flow verdict box → `SavedRun.signoff` → History → Studio description | nothing |
| One-click BibTeX of the run's open resources | `runToBibtex()` (pure, tested), flow + History buttons | manual |
| Studio handoff with claim + verdict + sign-off | `studioDescription`, paper runs now get `StudioButton` too | n/a |

- `lib/history.ts` — `signoff: { decision, at }` on `SavedRun`; `runToBibtex()` builds `@misc` entries
  from saved context (+ claim in the note); `runToMarkdown` keeps sign-off and `missing`.
- `lib/handoff.ts`, `/api/lab/studio`, `app/studio-button.tsx` — optional `claim` / `verdictLine` /
  `signoffLine` travel in the Studio description (still under the 2000-char cap), so Studio's first
  build starts from judged evidence, not a blank page — that is the Studio-hours argument.
- `app/page.tsx` — "Why Lab Pro instead of pasting into Claude?" strip (saved runs, verdict, BibTeX,
  Studio handoff, Muse-only billing). `needs` arrays dropped the stale `fireworks` entries: Lab Pro is
  Muse-only and the landing page finally says so.
- `app/history/page.tsx` — History now **shows** the claim, verdict (+ `missing`) and sign-off
  (previously stored but invisible), plus Copy BibTeX.

### 3. Muse-only router (unchanged, now truthful)

No new providers, no new keys, no Fireworks calls. Everything still rides the three Muse tiers;
`.env.example` math (40+ demo runs on $20) is untouched. `PARTNERS.md` needed no change — no partner
surface moved.

### `/demo/paid`

Not present on `main` (or any live route): it was deleted with the agent loop when main moved to the
generic flows. Nothing to update. The generic paper flow + these hardenings replace the toy-fixture
path — the demo is now "paste any of the three papers below", not a canned `attention_toy.py`.

## Files

- `lib/muse.ts` — baseline rule in `draftNotebook`; hardened `verdict` + `parseVerdict`.
- `lib/history.ts` — `signoff`, `runToBibtex`, markdown lines.
- `lib/handoff.ts`, `app/api/lab/studio/route.ts`, `app/studio-button.tsx` — judgement in handoff.
- `app/flow.tsx` — sign-off buttons, `missing` line, paper Studio button, Copy BibTeX, claim state.
- `app/history/page.tsx` — claim/verdict/sign-off display, Copy BibTeX.
- `app/page.tsx` — Pro strip, truthful `needs`.
- `docs/ARCHITECTURE.md`, `docs/SUBMISSION.md` — verdict + Pro copy updated.
- `tests/muse.test.ts` — `parseVerdict` (shape, blank-missing, rejections).
- `tests/history.test.ts` (new) — BibTeX keys/escaping/empty, markdown sign-off.
- `tests/handoff.test.ts` — judgement lines under the cap.

## Cost per run (unchanged bounds, prices env-driven)

Same call counts as iter-1 (1–2 heavy, 1 contributor rank, ≤3 contributor fixes, 1 wonder verdict).
New artifacts (`missing`, sign-off, BibTeX) are pure string handling — zero model calls.

## How to test

Checks (NOT run in this session — shell commands need interactive approval here; run before pushing,
CI runs the same):

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Type risk is low: all new fields optional, new helpers pure and covered. Two things to watch in
review: nested template literal in `StudioButton`'s `verdictLine` prop, and the `{...} | {}`
spread typing in `parseVerdict`.

Unit (no keys): `pnpm test` — new `parseVerdict`, `runToBibtex`, handoff-judgement cases.

Manual, one paper at a time (keys needed for runs; UI needs none):

1. `cp .env.example .env.local`, fill `OPENIDEA_API_KEY` + `META_API_KEY`. Open `/paper`.
2. **Paper 1 — double descent** (Belkin et al. 2019, the SUBMISSION demo): paste the abstract +
   "reproduce the test-error peak at the interpolation threshold". Expect: log shows `CHECK:`
   with measured peak position **and** a shuffled-baseline number; verdict `matches`/`partial`
   naming both numbers; a `To strengthen:` line when capped.
3. **Paper 2 — dropout** (Srivastava et al. 2014): "dropout shrinks the train-test gap on noisy
   synthetic data vs a no-dropout baseline". Expect: same CHECK + baseline shape, different claim —
   proof the checks are not attention-specific.
4. **Paper 3 — early stopping on noisy labels**: "test error at the best epoch beats the final
   epoch outside the standard error". Expect: verdict judges *that* sentence (from the log's
   `Plan: Muse (heavy) drafted the reproduction to "…"`), not the paste.
5. After any verdict: click **Sign off** (or **Challenge**). Expect: stamp line under the verdict,
   `Researcher sign-off` in `/history` for the run, and the sign-off sentence inside the Studio
   project description.
6. Click **Copy BibTeX** (flow done panel and History). Expect: `@misc` entries for the run's open
   resources, paste-ready.
7. Toy regression check: paste the old toy ("compute one-head attention weights and print them",
   no claim). Expect: verdict caps at `partial` and `missing` says what is absent (CHECK/baseline).
   This is the exact failure the judge scored — now visible instead of self-awarded.
8. Landing: `/` shows the Pro strip and no flow lists Fireworks under "Needs".

## Post-merge addendum (2026-11-02, `muse/lab-post-merge-pass`)

- The stash-vs-main conflicts are resolved; this doc's fixes are the kept side
  everywhere (see `docs/iterations/lab-muse-post-merge.md` for per-file calls).
- Gates **have now been run**: `pnpm lint && pnpm typecheck && pnpm test &&
  pnpm build` — all green, 14 files / 73 tests. (Supersedes the "NOT run"
  note in §How to test.)
- One gap this doc did not cover is now closed too: the **agent loop** judged
  the raw pasted text while the one-shot flow judged the drafted claim.
  `LabRun.claim` carries `draftNotebook`'s claim and `judge_paper` judges it
  (falls back to the paste when unset), reporting the claim in its observation.
- Manual steps 2–7 above are unchanged and still apply; add: run the same
  paper through `/agent` and confirm the verdict references the drafted claim.

## Known gaps (deliberate)

- `parseVerdict` requires a non-empty reason; a wonder response with a verdict but no reason now
  surfaces as "Verdict returned no reason" instead of an empty box. Strict, and said plainly.
- Challenge records the decision but no note (no prompt UI tax mid-hackathon); the type has room.
- Sign-off is per-browser (History is localStorage): the stamp travels to Studio, but a second
  device does not see it. Same trade-off as saved runs, stated on the History page.
- Photo canvas still draws all boxes while the parts list covers the top 12 (carried over).
