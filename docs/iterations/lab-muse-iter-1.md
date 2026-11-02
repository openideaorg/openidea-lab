# Lab iteration — Muse-only Lab Pro (≤$20) — 2026-11-02

Model: mostly `muse-spark-1.3-contributor` (this doc, small edits). No escalation —
nothing here needed heavy reasoning. The code itself routes heavy work to
`muse-spark-1.3` and verdicts to `muse-wonder-1.0` at runtime (env-overridable).

## What changed and why

Lab Pro is now **Muse-only**: every model call goes through the Meta Model API on
one of three tiers. One provider, one bill, no second API key — that is what keeps a
run to cents on a ≤$20 credit.

| Tier | Env | Default | Used for |
|---|---|---|---|
| contributor (cheap) | `META_MODEL` | `muse-spark-1.3-contributor` | rank, fix, labelParts, enrichParts |
| heavy | `META_MODEL_HEAVY` | `muse-spark-1.3` | planIdea, draftPrototype, draftNotebook |
| wonder | `META_MODEL_WONDER` | `muse-wonder-1.0` | verdict |

Unset `META_MODEL_HEAVY`/`META_MODEL_WONDER` fall back to `META_MODEL`, so one
variable still works. `modelFor()` reads the env live (not the import-time `env`
object) so tests and deploys see the current value.

### Files

- `lib/muse.ts` — now the only model client. `rank`, `fix`, `labelParts`,
  `verdict` moved here from `lib/fireworks.ts` onto the contributor/wonder tiers
  (same prompts, same JSON shapes); `enrichParts` also runs on contributor
  (summarising named parts needs no heavy reasoning — photo stays the cheapest
  run). `draftNotebook` now also returns the testable `claim` it was already
  asked to write, with `claimFromReadme()` as the no-extra-call fallback, and
  the paper text is truncated to 12k chars (~3k tokens) to keep the heavy call
  to cents. `fix()` takes a `history` of earlier attempts (fingerprints +
  headlines) so the model sees its last patch failed. `chat()` retries once on
  429/5xx (demo hits the API in bursts). `sanitizeFiles()` guards the loop
  against model output the sandbox cannot handle (paths escaping the project,
  empty lists, >60k single files).
- `lib/fireworks.ts` — thin shim re-exporting the Muse equivalents. No route
  calls it. Kept so old imports keep working and the partner stays visible.
- `lib/env.ts` / `.env.example` — new `META_MODEL_HEAVY`, `META_MODEL_WONDER`;
  `META_MODEL` default is now the contributor model. Fireworks vars marked
  legacy. `.env.example` documents the Lab Pro math: ~1 heavy draft +
  ~1 contributor rank + ≤3 contributor fixes per run = cents, so
  `META_CREDIT_USD=20` + stop at 90% covers 40+ demo runs.
- Routes — `/api/lab/search`, `/fix`, `/verdict`, `/segment` call `lib/muse.ts`
  and budget-check `meta` (was: `fireworks`). `/fix` accepts `history`.
  `/api/lab/plan` returns `{ files, claim }` for papers — the paper-ingest
  handoff: the verdict judges that sentence, not the raw pasted text
  (client falls back to pasted text for old servers).
- Agent loop (`app/flow.tsx`) — the research→prototype loop is now labelled
  Plan / Act / Observe in the log: "Plan: found N resources", "Plan: drafted…",
  "Observe: running…", "Act: error — …". Each failed attempt appends its
  fingerprint to `fixHistory` (last 3 sent with the next fix). Claim comes from
  the server, not `input.slice`.
- Studio create — `studioDescription()` now carries build steps, buildable flag
  and exists/missing lists plus per-file sizes, so Studio's first build starts
  from Lab's research. Route caps total size at 400 KB with a plain 400 message
  instead of a 502. `StudioButton` forwards the plan and the history `labRunId`,
  which lands in the description as a link back to the Lab run; the project URL
  is stamped via `updateRun()` (same id, so History → run → Studio round-trips
  instead of minting a new entry). History also persists the paper `claim` and
  `runToMarkdown` exports it.
- Copy/docs — `PARTNERS.md`, `ARCHITECTURE.md`, `SUBMISSION.md`, landing page,
  photo/paper copy say Muse throughout; Fireworks noted as retired shim.
  Usage panel header updated (Fireworks row kept for old runs).

### Kept from the working tree (reviewed, sound, not rewritten)

- `errorFingerprint()` + fingerprint-repeat stop + identical-fix stop +
  `tail(error, 8000)` + `attempt` in the fix loop.
- Photo `MAX_PARTS = 12` cap, crops-only second call.

## Cost per run (bounds, prices are env-driven)

| Call | Bound |
|---|---|
| Heavy draft (plan+draft, or notebook, or parts write) | 1–2 |
| Contributor rank | 1, skipped when ≤ 6 results |
| Contributor fix | ≤ 3, minus fingerprint / identical-fix early stops |
| Wonder verdict | 1 (paper flow only) |
| SAM 3 segment | 1 + warm-up 503s (no GPU billed on 503s) |

## How to test

Checks (must all pass before push; CI runs the same):

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

> NOT run in this session — the sandbox classifier was down (`muse-spark-1.3-contributor
> temporarily unavailable`), so every command beyond trivial reads was refused.
> Run the four before pushing; type risk is low (new code is additive: optional
> `history`/`claim` fields, pure `modelFor`/`claimFromReadme` covered by tests).

New tests (`tests/muse.test.ts`): tier defaults differ by construction,
`META_MODEL` fallback for unset tier overrides, claim extraction + empty
fallbacks. Updated `tests/handoff.test.ts` for the richer Studio description.

Manual (no keys needed for UI, keys needed for runs):

1. `cp .env.example .env.local` — with no keys, each flow reports which key it
   needs; with only `OPENIDEA_API_KEY`, search works and model steps show
   their prompts without spending.
2. Idea: open `/idea`, enter the soil-moisture demo idea. Expect log lines
   `Plan: …` → `Observe: …` → `Act: …`, usage panel showing only `Meta · Muse`
   rows with per-purpose labels, and `Open in Studio` creating a project whose
   description contains the build steps.
3. Paper: open `/paper`, paste the double-descent abstract. Expect the log
   `Plan: Muse drafted the reproduction to test "…"` and the verdict judging
   that same sentence (not the paste).
4. Photo: `/photo` unchanged behaviour, labels now via the contributor tier.
5. `/usage` dashboard: set `META_CREDIT_USD=20` and prices to see the pause math.

## Known gaps (deliberate)

- `lib/usage-types.ts` and `lib/budget.ts` still know the `fireworks`
  provider (dashboard shows old spend; new spend is zero). Removing it would
  rewrite stored counters — not worth it mid-hackathon.
- Photo canvas still draws all boxes while the parts list covers the top 12
  (noted before; one-line fix in `PhotoFlow.tsx` if a judge trips on it).
- `META_MODEL` fallback means `modelFor('heavy')` returns the contributor model
  when only `META_MODEL` is set — correct and cheap, just slower to converge
  on hard drafts; set `META_MODEL_HEAVY` for the demo machine.

## Addendum — loop hardening + handoff persistence (same day, second pass)

- `lib/muse.ts` — `fix()` parses through the shared `parseJson`/`unwrapFiles`
  helpers, and draft, notebook and fix results all pass through
  `sanitizeFiles()` (rejects `..`/absolute/empty paths, empty lists, single
  files over 60k chars), so bad model output fails with a plain message
  instead of stalling the browser runner.
- `app/flow.tsx` — the log names the tier behind each step (`Muse (heavy)
  drafted…`, `Asking Muse (contributor) to fix…`, `Verdict (wonder)`), so the
  cost control is visible in the demo; paper runs persist the judged `claim`
  into History.
- `tests/muse.test.ts` — 3 `sanitizeFiles` tests (clean passthrough, escaping
  paths rejected, empty/oversized rejected).
- `PARTNERS.md`, `docs/SUBMISSION.md` — tier wording updated (`enrichParts`
  contributor).
- Checks still NOT run in this session (shell commands need interactive
  approval here). Run `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
  before pushing; type risk is low (all new fields optional, new helpers pure).
