# OpenIdea Lab

**https://lab.openidea.world**

OpenIdea Lab turns an idea or research paper into a **verified, citable prototype** with a Muse-only agent loop (plan / act / observe), HITL sign-off, and Studio handoff.

> **Built during the Meta Global AI Developer Hackathon (Oct 26 – Nov 4, 2026), Startup track.**
> Everything in this repository was written during the event.
> It calls OpenIdea's search API ([openidea.world](https://openidea.world)), which existed before the hackathon and is **not** part of this submission. See [PARTNERS.md](PARTNERS.md).

## Product

| SKU | Price | What you get |
|---|---|---|
| **Free** | $0 | Teaser Lab Agent runs (metered), live console |
| **Lab Pro** | **≤ $20/mo** | More runs, durable replay fence, BibTeX export, HITL, Studio files handoff |

Primary UI: **`/agent`** — Muse chooses one tool per turn. Legacy `/idea` and `/paper` one-shot pipelines remain as demos. Photo / SAM 3 on Baseten is optional vision GPU, not LLM reasoning.

## Muse API key (Cursor / Claude Code)

Lab does **not** invent API keys. The Muse-only path reads:

```bash
META_API_KEY=…          # from Configure Claude Code / Cursor-configured Muse API keys
META_API_URL=https://api.meta.ai/v1
META_MODEL=muse-spark-1.3
```

Wire path: `.env.local` → `lib/env.ts` `keyFor('meta')` → `lib/muse.ts` / `lib/muse-agent.ts` → Meta Model API chat completions.

## How the agent works

```
idea / paper
   │
   ▼
Muse agent loop (one tool / turn)
  search_open · expand_graph · set_plan · draft_code
  run_sandbox (browser) · fix_code · judge_paper
  cite_sources · submit_prototype · request_human · finish
   │
   ▼
console (plan / act / observe) + usage (Meta) → export / Studio
```

Details in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Stack

- **Muse Spark** (Meta Model API): **only** LLM for agent reasoning
- **WebContainer** / **Pyodide**: browser sandboxes
- **SAM 3** on **Baseten**: optional photo segmentation
- **Fireworks**: legacy demo path only (not the Lab Agent)
- **Next.js 15**, TypeScript, Tailwind

## Run it locally

```bash
git clone https://github.com/openideaorg/openidea-lab
cd openidea-lab
pnpm install
cp .env.example .env.local   # set META_API_KEY from Cursor/Claude Code Muse keys
pnpm dev
```

Open `/agent`. Optional: `LAB_PLAN=pro` and `LAB_PRO_PRICE_USD=20` (hard-capped at 20).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security: [SECURITY.md](SECURITY.md).

## Licence

[MIT](LICENSE).
