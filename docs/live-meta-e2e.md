# Live Muse E2E (C5)

End-to-end against the real Meta Model API and the real platform: the same
chain the agent loop walks — paper → graph → plan → sandbox → cite → Studio.

## Prereqs

- Server running with keys: `OPENIDEA_API_KEY` + `META_API_KEY` in `.env.local`
  (copy from `.env.example`; never commit `.env.local`). Without the platform
  key, search/graph/extract answer 424 and the script continues to the
  Muse-only steps.
- `META_API_KEY` also exported in the shell that runs the script (only the
  ping step uses the shell's copy; the rest rides the server's).
- Public deploys may set `LAB_PASSCODE` — sign in at `/enter` first, or run
  against `http://localhost:3000`.
- Needs `curl` + `python3` (JSON shaping only). No new dependencies.

## Run

```bash
BASE_URL=http://localhost:3000 ./scripts/lab-e2e-meta.sh [paper-text-file]
```

Responses land in `/tmp/lab-e2e/` (`ping/search/graph/plan/verdict *.json`).

## What each step proves

| # | Step | Pass |
|---|---|---|
| 1 | Muse ping (contributor) | 200 + `pong`, usage tokens printed |
| 2 | `POST /api/lab/search` | 200, ranked papers/code/datasets |
| 3 | `POST /api/lab/graph` | 200, nodes/edges grounding the plan |
| 4 | `POST /api/lab/plan` (paper) | 200, `claim` + `reproduce.py`/`README.md` |
| 5 | `POST /api/lab/verdict` (wonder) | 200 on a CHECK+baseline output |
| 6 | Cite + Studio | Operator clicks: Copy BibTeX, sign-off, Open in Studio |

The sandbox is client-side by design (Pyodide runs in the browser, costs
nothing per run). Step 5 uses exactly the strings a real browser run prints —
`CHECK: pass …` plus a shuffled-baseline number — which are the same strings
the submit gate (`lib/agent/verify/prototype.ts`) requires. A toy print
fails step 5's contract and can never reach submit.

## Troubleshooting

- `424` on search/graph/plan: platform key missing server-side — set
  `OPENIDEA_API_KEY`, restart, re-run.
- `429 … budget`: the ≤ $20 credit is nearly spent — check `/usage`.
- Verdict `partial`: the output shape is right but a CHECK line or baseline
  number is missing — the `missing` field names which one; fix and re-run.
- Photo/SAM steps are not in this script: SAM 3 needs the Baseten endpoint
  (`BASETEN_API_KEY` + `BASETEN_SAM3_MODEL_ID`) and its own warming window;
  exercise via `/photo`.

## Cost

One E2E pass ≈ one paper run: 1 heavy draft + 1 contributor ping/rank +
1 wonder verdict — cents. Responses carry `usage` arrays; sum them from
`/tmp/lab-e2e/*.json` for the exact tokens.
