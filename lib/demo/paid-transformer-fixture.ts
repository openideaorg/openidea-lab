/**
 * Fixture for the Attention Is All You Need → Lab Pro paid end-state demo.
 * Used by /demo/paid so judges see console, citations, sign-off, and ≤$20 Pro
 * without spending Muse credits.
 */

import type { Citation, ConsoleRow, LabRun, LabVerdict } from '../agent/types';
import type { Plan, GeneratedFile } from '../muse';

export const DEMO_STEPS = [
  { id: 'paste', label: 'Paste paper' },
  { id: 'console', label: 'Console loop' },
  { id: 'approve', label: 'Approve plan' },
  { id: 'sandbox', label: 'Sandbox toy' },
  { id: 'bibtex', label: 'Pro BibTeX' },
  { id: 'paid', label: 'Paid end' },
] as const;

export type DemoStepId = (typeof DEMO_STEPS)[number]['id'];

export const PAPER_BLURB = `Title: Attention Is All You Need
Authors: Ashish Vaswani, Noam Shazeer, Niki Parmar, Jakob Uszkoreit, Llion Jones, Aidan N. Gomez, Lukasz Kaiser, Illia Polosukhin
arXiv:1706.03762

Abstract: The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. The best performing models also connect the encoder and decoder through an attention mechanism. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely.`;

export const DEMO_PLAN: Plan = {
  summary:
    'Build a tiny educational self-attention toy: one-head attention over a short token sequence with a live matrix heatmap, citing Vaswani et al. 2017. Fits a 90-minute hackathon afternoon.',
  buildable: true,
  exists: [
    'Scaled dot-product attention (Vaswani et al.)',
    'Open Pyodide / browser Python sandbox',
    'OpenIdea graph neighbors for Transformer tutorials',
  ],
  missing: ['Full multi-head training loop (out of scope)', 'GPU training'],
  steps: [
    'Search Open Idea for Transformer / attention primers',
    'Lock a one-head educational claim plan',
    'Draft a single-file attention demo + heatmap',
    'Run in sandbox; fix until green',
    'Cite sources + BibTeX (Lab Pro)',
    'Researcher sign-off → Studio handoff',
  ],
};

export const DEMO_FILES: GeneratedFile[] = [
  {
    path: 'attention_toy.py',
    content: `"""Tiny self-attention toy — Open Idea Lab Pro demo.
Educational one-head attention over a 4-token sequence.
"""
import math

TOKENS = ["The", "cat", "sat", "mat"]
# Toy embeddings (d=4)
E = [
    [1.0, 0.2, 0.1, 0.0],
    [0.2, 1.0, 0.3, 0.1],
    [0.1, 0.3, 1.0, 0.4],
    [0.0, 0.1, 0.4, 1.0],
]

def softmax(xs):
    m = max(xs)
    ex = [math.exp(x - m) for x in xs]
    s = sum(ex)
    return [v / s for v in ex]

def attention(E, d=4):
    scores = [[sum(E[i][k] * E[j][k] for k in range(d)) / math.sqrt(d)
               for j in range(len(E))] for i in range(len(E))]
    weights = [softmax(row) for row in scores]
    out = [[sum(weights[i][j] * E[j][k] for j in range(len(E)))
            for k in range(d)] for i in range(len(E))]
    return weights, out

W, O = attention(E)
print("tokens:", TOKENS)
print("attention weights:")
for t, row in zip(TOKENS, W):
    print(f"  {t:4s}", " ".join(f"{v:.2f}" for v in row))
print("ok — Lab Pro attention toy")
`,
  },
];

export const DEMO_CITATIONS: Citation[] = [
  {
    title: 'Attention Is All You Need (Vaswani et al., 2017)',
    url: 'https://arxiv.org/abs/1706.03762',
    type: 'paper',
  },
  {
    title: 'The Illustrated Transformer — Jay Alammar',
    url: 'https://jalammar.github.io/illustrated-transformer/',
    type: 'tutorial',
  },
  {
    title: 'OpenIdea graph: Transformer / self-attention neighborhood',
    url: 'https://openidea.world',
    type: 'graph',
  },
];

export const DEMO_VERDICT: LabVerdict = {
  verdict: 'partial',
  reason:
    'Toy matches the paper’s core scaled-dot-product claim for a single head; multi-head + positional encoding left as stretch goals.',
};

function consoleFor(step: DemoStepId): ConsoleRow[] {
  const base: ConsoleRow[] = [
    {
      turn: 1,
      phase: 'plan',
      tool: 'search_open',
      text: 'Found 6 Open Idea hits for Transformer / scaled attention. Top: Vaswani 2017 + Illustrated Transformer.',
      at: 1,
    },
    {
      turn: 2,
      phase: 'act',
      tool: 'expand_graph',
      text: 'Graph expand: self-attention → encoder stack → positional encoding. Keeping scope to one-head toy.',
      at: 2,
    },
    {
      turn: 3,
      phase: 'plan',
      tool: 'set_plan',
      text: DEMO_PLAN.summary,
      at: 3,
    },
  ];
  if (step === 'paste') return [];
  if (step === 'console') return base;
  const approved: ConsoleRow[] = [
    ...base,
    {
      turn: 4,
      phase: 'observe',
      tool: 'request_human',
      text: 'HITL: waiting for plan approval (Lab Pro).',
      at: 4,
    },
  ];
  if (step === 'approve') return approved;
  const drafted: ConsoleRow[] = [
    ...approved,
    {
      turn: 5,
      phase: 'observe',
      text: 'Human approved plan. Continuing.',
      at: 5,
    },
    {
      turn: 6,
      phase: 'act',
      tool: 'draft_code',
      text: 'Drafted attention_toy.py — one-head scaled dot-product + printable weight matrix.',
      at: 6,
    },
    {
      turn: 7,
      phase: 'act',
      tool: 'run_sandbox',
      text: 'Sandbox (Pyodide): printed 4×4 attention weights; exit ok.',
      at: 7,
    },
  ];
  if (step === 'sandbox') return drafted;
  const cited: ConsoleRow[] = [
    ...drafted,
    {
      turn: 8,
      phase: 'act',
      tool: 'cite_sources',
      text: 'Attached 3 citations. BibTeX export unlocked on Lab Pro.',
      at: 8,
    },
    {
      turn: 9,
      phase: 'act',
      tool: 'judge_paper',
      text: `Verdict ${DEMO_VERDICT.verdict}: ${DEMO_VERDICT.reason}`,
      at: 9,
    },
  ];
  if (step === 'bibtex') return cited;
  return [
    ...cited,
    {
      turn: 10,
      phase: 'act',
      tool: 'submit_prototype',
      text: 'Prototype submitted. Awaiting researcher sign-off.',
      at: 10,
    },
    {
      turn: 11,
      phase: 'observe',
      tool: 'finish',
      text: 'Signed off. Lab Pro run complete — Studio files handoff ready. Meter: $0.41 Muse of $20 Pro envelope.',
      at: 11,
    },
  ];
}

export function fixtureRun(step: DemoStepId): LabRun {
  const now = Date.now();
  const status =
    step === 'paste'
      ? 'running'
      : step === 'console'
        ? 'running'
        : step === 'approve'
          ? 'needs_input'
          : step === 'sandbox'
            ? 'needs_client'
            : step === 'bibtex'
              ? 'awaiting_signoff'
              : 'done';

  return {
    id: 'demo-attn-pro-001',
    kind: 'paper',
    input: PAPER_BLURB,
    planTier: step === 'paste' ? 'free' : 'pro',
    resources: [],
    plan: step === 'paste' ? undefined : DEMO_PLAN,
    planApproved: ['sandbox', 'bibtex', 'paid'].includes(step),
    files: ['sandbox', 'bibtex', 'paid'].includes(step) ? DEMO_FILES : [],
    citations: ['bibtex', 'paid'].includes(step) ? DEMO_CITATIONS : [],
    sandbox:
      step === 'sandbox' || step === 'bibtex' || step === 'paid'
        ? {
            ok: true,
            output:
              'tokens: [\'The\', \'cat\', \'sat\', \'mat\']\nattention weights:\n  The  0.41 0.22 0.20 0.17\n  cat  0.21 0.39 0.24 0.16\n  sat  0.18 0.24 0.36 0.22\n  mat  0.16 0.17 0.24 0.43\nok — Lab Pro attention toy',
          }
        : undefined,
    verdict: ['bibtex', 'paid'].includes(step) ? DEMO_VERDICT : undefined,
    usage: [
      {
        kind: 'tokens',
        provider: 'meta',
        model: 'muse-wonder-1.0',
        label: 'choose',
        promptTokens: 1200,
        completionTokens: 180,
        totalTokens: 1380,
        costUsd: 0.18,
      },
      {
        kind: 'tokens',
        provider: 'meta',
        model: 'muse-spark-1.3',
        label: 'draft',
        promptTokens: 900,
        completionTokens: 640,
        totalTokens: 1540,
        costUsd: 0.23,
      },
    ],
    status: status as LabRun['status'],
    stopReason:
      step === 'approve'
        ? 'approve_plan'
        : step === 'bibtex'
          ? 'signoff'
          : step === 'paid'
            ? 'submitted'
            : undefined,
    turn: consoleFor(step).length ? Math.max(...consoleFor(step).map((c) => c.turn)) : 0,
    messages: [],
    console: consoleFor(step),
    fixCount: 0,
    submitRefusals: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function bibtexFrom(citations: Citation[]): string {
  return citations
    .map(
      (c, i) =>
        `@misc{lab${i},\n  title={${c.title.replace(/[{}]/g, '')}},\n  url={${c.url}},\n  note={Open Idea Lab Pro}\n}`,
    )
    .join('\n\n');
}

export const STEP_NARRATION: Record<DemoStepId, string> = {
  paste:
    'Alex (CS student / hackathon builder) pastes Attention Is All You Need (Vaswani et al., arXiv:1706.03762). Free teaser: try the Muse agent console once.',
  console:
    'Muse Wonder chooses tools; Spark drafts. Console shows plan → act → observe for the Transformer claim.',
  approve:
    'Lab Pro HITL: approve the one-head attention toy plan before sandbox spend.',
  sandbox:
    'Pyodide sandbox prints a 4×4 attention matrix — a runnable educational toy from the paper.',
  bibtex:
    'Pro fence unlocked: BibTeX export + paper verdict. Free teaser cannot download citations.',
  paid:
    'Paid end: researcher signed off, Studio handoff ready, Lab Pro ≤ $20/mo. Outcome worth paying for.',
};
