# Submission draft — Meta Global AI Developer Hackathon, Startup track

Working text for the submission form. Edit freely; keep the claims matching what the demo shows.

## One line

OpenIdea Lab turns an idea, a research paper or a photo of hardware into a running prototype, by
reading what the open world already knows and building from it with Muse Spark and SAM 3.

## The problem

Founders and researchers lose weeks at the same step: finding out what already exists, and getting
from "this might work" to something that runs. Search tools stop at a list of links. Build tools start
from a blank page. Nothing connects the two.

## What we built (during the event)

A web app at https://lab.openidea.world with three entry points:

1. **Idea → prototype.** Lab searches openidea.world for papers, code, datasets and hardware, asks the
   knowledge graph what connects them, and has Muse judge whether the idea is buildable, what
   exists, what is missing, and write a first prototype. The prototype builds and runs in the user's
   browser; Muse fixes it when it fails. The result opens in App Studio for the real build.
2. **Paper → reproduction.** Muse picks one reproducible result from the paper and writes a
   Python script that runs in the browser (Pyodide). The script checks its own result against a
   null baseline and prints a `CHECK:` line; Muse then judges whether the printed output
   supports the paper's claim, so the figure comes with a verdict, not just "it ran". The
   researcher signs off, and History keeps the claim, verdict and a one-click BibTeX.
3. **Photo → parts list.** SAM 3, served on Baseten, outlines every component in a photo of hardware.
   Muse names each part; openidea.world finds datasheets and listings; Muse writes the parts
   list.

Every run shows what it spent per provider, and a credit dashboard pauses new runs before the
hackathon credit is gone.

## Partner technology

| Partner | Product | Role | Code |
|---|---|---|---|
| Meta | Muse (Meta Model API) | Read, plan, write the first draft (heavy); rank, fix, label, parts list (contributor); verdicts (wonder) | `lib/muse.ts` |
| Meta | SAM 3 | Segment parts in a photo | `baseten/sam3/`, `lib/baseten-sam3.ts` |
| Baseten | GPU model hosting | Serve SAM 3 behind an HTTPS endpoint | `baseten/sam3/` |

## What is not part of the submission

The Open Idea platform (openidea.world: search, knowledge graph, App Studio, Workspaces) existed before
the event. Lab calls its public API and links back to it. See `PARTNERS.md`.

## Why it matters for a startup

Open Idea's thesis is Research → Build → Collaborate. The platform already does Research (search) and
Build (App Studio) as separate products. Lab is the bridge: it is the first thing on openidea.world
that takes a search result and turns it into running code, and it does so with Meta's models. The
hackathon build becomes the "Build this" button on every search result.

## Demo

- Idea: a low-cost soil moisture sensor for small farmers that alerts in Hindi without a data plan.
- Paper: double descent with random Fourier features (Belkin et al., 2019), reproduced on synthetic data.
- Photo: an ESP32 board with a moisture probe and wires.

Three recorded clips are in `demo/` as a safety net; the live site is the primary demo.

## Honest limits

- Prototypes run on sample data in the browser; they are starting points, not products.
- Paper reproductions reproduce the shape of a result on small synthetic data, not the paper's exact numbers.
- SAM 3 on a scale-to-zero GPU takes 30–90 s to wake; the UI says so.
- Modal was in the original design as the sandbox; credits were not available, so the sandboxes run
  in the browser. A Modal runner slots into the same interface.

## Team

Sony Yadav (Open Idea). Built with Claude Code.
