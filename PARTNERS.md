# Partner technology used in this project

Built for the Meta Global AI Developer Hackathon, Startup track (26 Oct – 4 Nov 2026).
This page says exactly what each partner's product does here and where in the code it
is called, so a judge can verify it in one click.

Lab Pro is Muse-only: every model call goes through the Meta Model API on one of
three tiers (contributor for explore/edits, heavy for the first draft, wonder for
verdicts). One provider, one bill, inside the ≤$20 credit.

| Partner | Product | What it does in Lab | Code |
|---|---|---|---|
| **Meta** | Muse Wonder + Muse Spark (+ Contributor) | **Primary LLM path**: Wonder/Spark for plan, draft, hard fix, verdict, controller; Muse Spark Contributor for rank/observe/cheap retries. Router in [`lib/muse-models.ts`](lib/muse-models.ts). Key via `META_API_KEY` (Cursor / Claude Code). | [`lib/muse.ts`](lib/muse.ts), [`lib/muse-agent.ts`](lib/muse-agent.ts), [`lib/agent/`](lib/agent/) |
| **Meta** | SAM 3.1 (`sam-3.1`) | Optional Meta API segmentation (alongside Baseten SAM) | [`lib/muse-models.ts`](lib/muse-models.ts) |
| **Meta** | SAM 3 | Optional vision: outlines parts in a hardware photo (secondary to Muse reasoning) | [`baseten/sam3/`](baseten/sam3/) (deployment), [`lib/baseten-sam3.ts`](lib/baseten-sam3.ts) (client) |
| **Baseten** | GPU model hosting | Optional SAM 3 HTTPS endpoint (Moonstar GPU credit; not LLM) | [`baseten/sam3/`](baseten/sam3/) |
| **Fireworks** | Fast open-model inference | **Legacy one-shot flows only** — not used by the Muse-only agent loop | [`lib/fireworks.ts`](lib/fireworks.ts) |

## Product packaging

- **Free** teaser: few Lab Agent runs, no durable export fence unlocks.
- **Lab Pro ≤ $20**: paid SKU for metered runs, replay, citations export, HITL (`lib/lab-plan.ts`).

## What is NOT part of the submission

- **OpenIdea search** and its **knowledge graph** at openidea.world existed before the event. Lab
  reads them through [`lib/openidea.ts`](lib/openidea.ts) and [`lib/graph.ts`](lib/graph.ts) and
  nothing more.
- **App Studio** and **Workspaces** on openidea.world are pre-existing. Lab hands results
  to them by deep link ([`lib/handoff.ts`](lib/handoff.ts)); it does not contain them.
- **Fireworks** powered the fix loop, ranking, labelling and verdicts in an earlier
  iteration. The code remains as a thin shim ([`lib/fireworks.ts`](lib/fireworks.ts), re-exporting
  the Muse equivalents) but no route calls it; Lab Pro keeps the whole run on Muse so the
  demo fits the credit.

## Modal

Modal remains optional non-LLM infra (heavy sandbox). Browser WebContainer / Pyodide are the
default sandboxes. LLM agent reasoning stays Muse-only.
