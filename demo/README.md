# Demo inputs

One recorded input and output per flow, so judges can see the result without
spending anyone's credits and so a cold GPU never ruins a live demo.

| Flow | Input | Output |
|---|---|---|
| Idea | `idea/input.txt` | `idea/plan.json`, `idea/files/` |
| Paper | `paper/input.txt` (arXiv id in first line) | `paper/reproduce.py`, `paper/figure_1.png` |
| Photo | `photo/input.jpg` | `photo/outlined.png`, `photo/parts.md` |

## Paid Lab Pro walkthrough (no Muse key required)

Open `/demo/paid?step=paid` for the Attention Is All You Need → Lab Pro ≤ $20 end-state
(console, BibTeX, sign-off, Studio handoff). Steps: `paste` · `console` · `approve` ·
`sandbox` · `bibtex` · `paid`. Fixture: `lib/demo/paid-transformer-fixture.ts`.

Capture: `node scripts/capture-paid-demo.mjs --base http://127.0.0.1:3000 --out ./out`
Pay judge: `lib/pay-judge.ts` (Muse Wonder when `META_API_KEY` set; else simulated).

Recorded during the hackathon window; added as each flow is finished.
