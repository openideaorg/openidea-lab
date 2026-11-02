# Architecture

Lab is a Next.js app deployed at https://lab.openidea.world. It is a client of the Open Idea
platform: it reads from the platform's search API and writes results back into Studio and
Workspaces by deep link. It contains no platform code.

## The three flows

```
                 ┌──────────────────────────────────────────────┐
  input ───────► │ OpenIdea search (existing API)               │
                 │ papers · code · datasets · models · hardware │
                 └──────────────────────┬───────────────────────┘
                                        │ raw results
                                        ▼
                 ┌──────────────────────────────────────────────┐
                 │ Muse Agent loop (choose one tool / turn)     │
                 │ search · graph · plan · draft · fix · judge  │
                 └──────────────────────┬───────────────────────┘
                                        │ files + console
          ┌─────────────────────────────┼─────────────────────────────┐
          ▼                             ▼                             ▼
  💡 Idea                       📄 Paper                      📷 Photo (optional)
  WebContainer (client)         Pyodide (client)              SAM 3 on Baseten (GPU only)
  Muse fixes on error           Muse verdict + HITL sign-off  secondary to Muse reasoning
  ─► Lab Pro export / Studio    ─► citations + sign-off
```

## Why each piece is where it is

**Muse Spark is the only LLM on the product path.** The Lab Agent (`lib/agent/`, `/agent`) uses
Muse for tool choice, plan, draft, fix, rank, and verdict. Fireworks remains only on the legacy
one-shot `flow.tsx` demo. Optional Baseten SAM 3 is vision GPU, not reasoning.

**Sandboxes run in the browser.** Modal was the original sandbox and its credits were not
available. A WebContainer (JavaScript) and Pyodide (Python) run on the user's machine, cost
nothing per run, and give the agent real runtime errors, which is the thing the platform's
own build gate lacks. The limit is honest: no GPU, no heavy PyTorch. Paper reproductions
target one figure or table on a small sample, and the UI says so.

**SAM 3 on Baseten.** Segmentation needs a GPU. Baseten serves a model behind an HTTPS
endpoint with scale-to-zero; `baseten/sam3/` is the Truss config. Cold starts are 30–90 s,
so the UI shows a warming state instead of a spinner.

**One file per provider.** `lib/muse.ts`, `lib/baseten-sam3.ts`,
`lib/openidea.ts`. Each exports plain functions. Nothing else imports an SDK. Swapping a
provider, or adding Modal later, is one file. (`lib/fireworks.ts` remains as a thin
re-exporting shim from an earlier iteration; no route calls it.)

**The knowledge graph grounds the plan.** The platform keeps a Neo4j graph of
`(Resource)-[:MENTIONS]->(TECH | ORG | PERSON)`. After search, Lab asks for the one-hop
neighbourhood of the results (`lib/graph.ts`), draws it (resources left, shared entities
right, sized by how many results mention them) and hands Muse a short paragraph:
"technologies these resources share: …". The exists/missing answer then names real nodes.
If the graph is down or knows none of the results, the flow continues without it.

**Open Resources links in.** Every result on openidea.world/openresources can carry a
"Build this" link to `lab.openidea.world/idea?q=<title>` or `/paper?q=…`; the flow pages
read `?q=` and pre-fill. That is the Research → Build bridge the platform lacked.

**Hand-off by deep link.** `lib/handoff.ts` builds the "Open in Studio" and "Save to
Workspace" URLs and posts files to the platform's `/api/v1/studio/projects`. Lab never
stores the user's project; the platform does.

## Repository layout

```
app/                     Next.js App Router
  page.tsx               the three entry cards
  idea/  paper/  photo/  one route per flow
  api/lab/…              thin routes; all logic is in lib/
  graph-view.tsx         SVG picture of the subgraph
lib/
  openidea.ts            platform search client
  graph.ts               knowledge-graph client + prompt helper
  muse.ts                Muse client (plan/draft/rank/fix/label/verdict, tiered)
  muse-agent.ts          Muse tool-choice, rank, fix, verdict
  agent/                 Muse-only handbook loop + tools + verify
  lab-plan.ts            Free vs Lab Pro ≤ $20 packaging
  fireworks.ts           legacy one-shot helpers (optional)
  baseten-sam3.ts        optional SAM 3 client
  runner/
    webcontainer.ts      JS sandbox
    pyodide.ts           Python sandbox
  handoff.ts             links back to the platform
app/agent/               agent console UI (plan/act/observe)
baseten/sam3/            Truss deployment for SAM 3
demo/                    recorded inputs and outputs for each flow
docs/                    this file and friends
```

## Muse API key

Set `META_API_KEY` from **Cursor / Claude Code Muse configuration** (Configure Claude Code or
Cursor-configured Muse API keys). Lab reads it only through `lib/env.ts` → `keyFor('meta')`.
Never commit keys. `.env.example` documents the variable.

## Muse model router (quality vs credit)

Lab does **not** use one default model for every step. `lib/muse-models.ts` `routeMuseModel()`
picks the best Meta Model API id per task ([docs](https://dev.meta.ai/docs/models)):

**Primary builders** = Muse **Wonder** + **Spark** (Standard) for platform/core agent work.
**Contributor** = cheaper credit for light steps and cheap retries.

| Task | Model | Tier | Why |
|---|---|---|---|
| choose (controller) | `muse-wonder-1.0` | Wonder | Long-horizon tool loop |
| plan | `muse-wonder-1.0` | Wonder | Hard buildability judgment |
| draft / notebook | `muse-spark-1.3` | Spark | Coding-tuned primary builder |
| fix (attempt 0–1) | `muse-spark-1.3` | Spark | Hard fixes |
| fix (attempt ≥ 2) | `muse-spark-1.3-contributor` | Contributor | Cheap retries |
| verdict / claims | `muse-wonder-1.0` | Wonder | Strict paper judgment |
| rank / observe | `muse-spark-1.2-contributor` | Contributor | Classify / light observe |
| enrich / vision | `muse-spark-1.3-contributor` | Contributor | Light write / crop labels |
| segment | `sam-3.1` | SAM | Geometry (optional vs Baseten) |

Override any role with `META_MODEL_<ROLE>`. `META_MODEL_FORCE_ALL=1` + `META_MODEL` collapses chat tasks.
The agent loop injects the live routing table into the controller playbook each turn.


## Access

A public deployment needs two things static code does not give: a way to keep strangers from spending
the credit, and a cap on how fast anyone can. `lib/access.ts` provides both.

- **Passcode.** With `LAB_PASSCODE` set, pages redirect to `/enter` (middleware, Edge runtime) and
  `/api/lab/*` answers 401 until the visitor's cookie holds the passcode's SHA-256. One shared secret
  for judges and friends; not accounts.
- **Rate limit.** `LAB_RATE_LIMIT_PER_HOUR` calls per visitor IP (default 40, about eight builds),
  counted in the same store as the budget so it holds across serverless instances with Redis.
- Both live in `safe()` (`lib/route.ts`), so a new route is protected by wrapping it.

## Hand-off to Studio

`POST /api/lab/studio` creates an App Studio project on openidea.world with the visitor's own
platform API key, forwarded once and never stored. The platform's `POST /api/v1/studio/projects`
takes a title and description today, so the description carries the idea, Lab's plan and the file
list; the files are sent as well for when the platform accepts them. The key is kept in the visitor's
browser (localStorage) so it is asked for once.

## Verdict on paper runs

Running is not reproducing. After a paper script runs, `/api/lab/verdict` gives Muse (wonder tier) the paper's
claim, the script's README and its printed output, and gets back `matches | partial | no` with a one-
sentence reason, shown under the figure. A `matches` needs two things in the output: a `CHECK: pass` line
with the measured number, and a null-baseline comparison (shuffled control) the claim beats outside the
standard error — a script that merely prints weights caps at `partial`, never `matches`. The verdict also
names the one check that would raise it (`missing`), and the researcher signs off or challenges it; the
sign-off is saved with the run and travels into the Studio handoff. The claim judged is
the one the draft step extracted (`claim` in `/api/lab/plan`), not the raw pasted text.

## Usage tracking

Every provider call is recorded, and each API route returns what its request spent next to its
result. The flow pages add it up and show a "Usage this run" table.

- **Meta** reports tokens in the `usage` field of the chat-completions response
  (`lib/muse.ts` passes it to `recordTokens`, labelled by purpose and tier:
  plan, draft, notebook, parts, rank, fix, label, verdict).
- **Baseten** bills SAM 3 by GPU time, so there are no tokens. `lib/baseten-sam3.ts` records how
  many seconds each call held the endpoint and whether it hit a cold start.
- **Per-request, not global.** `withUsage` in `lib/usage.ts` uses AsyncLocalStorage, so
  concurrent requests never mix. Server logs also get one `[usage] …` line per call.
- **Cost is opt-in.** Set the `*_PRICE_*` variables in `.env.local` (see `.env.example`) and the
  panel shows dollars; leave them empty and it shows tokens and seconds only. Prices are not
  hard-coded because they change.
- Usage is per run and lives in the page; nothing is stored. For monthly totals use each
  provider's own dashboard, which is the billing source of truth.

## Running it yourself

Every provider key in `.env.example` is optional. With none set, the UI loads and each flow
reports which key it needs. With only `OPENIDEA_API_KEY`, search works and the model steps
show their prompts without calling anything, which is how UI work is done without spending.

## If Modal becomes available

Add `lib/runner/modal.ts` with the same interface as the two browser runners. Paper flows
gain real GPU Python; idea flows gain a per-user microVM with `npm install`. Nothing else
changes.
