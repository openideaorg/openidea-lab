/**
 * Pay judge — Muse-routed (Wonder/Spark) verdict: would a common-audience buyer
 * pay ≤ $20/mo for this Lab Pro end-state?
 *
 * Uses META_API_KEY when present; otherwise an honest local heuristic from UI
 * quality signals (for screenshot/demo iteration without credits).
 */

import { keyFor, notConfigured, type Result } from './env';
import { routeMuseModel } from './muse-models';
import { LAB_PRO_MAX_PRICE_USD } from './lab-plan';
import { env } from './env';
import { recordTokens, type ApiUsage } from './usage';

export type PayJudgeVerdict = 'YES' | 'NO';

export interface PayJudgeInput {
  /** Short product description of the end-state being judged. */
  productSummary: string;
  /** What the buyer receives (console, citations, sign-off, price). */
  buyerGets: string[];
  /** Absolute or relative paths to screenshots / PDF reviewed. */
  mediaPaths: string[];
  /** Optional free-text notes from the latest demo iteration. */
  notes?: string;
  /** Iteration number (1-based). */
  iteration: number;
}

export interface PayJudgeResult {
  verdict: PayJudgeVerdict;
  score: number; // 0–100 willingness
  why: string;
  gaps: string[];
  improvements: string[];
  model: string;
  mode: 'muse' | 'simulated';
  iteration: number;
  criteria: string[];
}

export const PAY_JUDGE_CRITERIA = [
  'Clear paid outcome (not a toy paste-and-forget): saved run, citations, sign-off visible',
  'Lab Pro price ≤ $20 is obvious and credible vs free teaser fences',
  'Agent console shows real plan/act/observe work a builder would trust',
  'Prototype looks runnable / educationally useful from a known paper',
  'UI/copy would not embarrass a buyer showing teammates; low clutter, coherent brand',
  'A common CS student / indie hacker / R&D eng would pay ≤ $20/mo for this end-state',
] as const;

const SYSTEM = `You are a skeptical common-audience buyer for Open Idea Lab Pro (≤ $${LAB_PRO_MAX_PRICE_USD}/mo).
Judge ONLY whether you would pay that price for the described end-state.
Be honest. Prefer NO if the product still feels like a free demo, missing citations/sign-off, or looks unfinished.
Answer JSON: {"verdict":"YES"|"NO","score":0-100,"why":string,"gaps":string[],"improvements":string[]}.`;

async function museJudge(input: PayJudgeInput): Promise<Result<PayJudgeResult>> {
  const key = keyFor('meta');
  if (!key) return notConfigured('meta');

  const route = routeMuseModel('verdict', { quality: 'primary' });
  const user = [
    `Iteration: ${input.iteration}`,
    `Product summary:\n${input.productSummary}`,
    `Buyer gets:\n- ${input.buyerGets.join('\n- ')}`,
    `Media paths:\n- ${input.mediaPaths.join('\n- ')}`,
    input.notes ? `Notes:\n${input.notes}` : '',
    `Criteria:\n- ${PAY_JUDGE_CRITERIA.join('\n- ')}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const res = await fetch(`${env.metaApiUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: route.model,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    return { ok: false, error: `Pay judge Muse failed: ${res.status} ${await res.text()}` };
  }
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: ApiUsage };
  recordTokens('meta', route.model, 'pay_judge', body.usage);
  const raw = body.choices?.[0]?.message?.content;
  if (!raw) return { ok: false, error: 'Pay judge Muse returned no content' };
  try {
    const parsed = JSON.parse(raw) as {
      verdict?: string;
      score?: number;
      why?: string;
      gaps?: string[];
      improvements?: string[];
    };
    const verdict: PayJudgeVerdict = parsed.verdict === 'YES' ? 'YES' : 'NO';
    return {
      ok: true,
      value: {
        verdict,
        score: typeof parsed.score === 'number' ? parsed.score : verdict === 'YES' ? 75 : 40,
        why: parsed.why || 'No reason given',
        gaps: parsed.gaps ?? [],
        improvements: parsed.improvements ?? [],
        model: route.model,
        mode: 'muse',
        iteration: input.iteration,
        criteria: [...PAY_JUDGE_CRITERIA],
      },
    };
  } catch {
    return { ok: false, error: `Pay judge JSON parse failed: ${raw.slice(0, 200)}` };
  }
}

/** Honest local heuristic when META_API_KEY is absent. */
export function simulatePayJudge(input: PayJudgeInput): PayJudgeResult {
  const text = `${input.productSummary}\n${input.buyerGets.join('\n')}\n${input.notes ?? ''}`.toLowerCase();
  const media = input.mediaPaths.join(' ').toLowerCase();

  const checks = [
    { ok: /lab pro|≤\s*\$?20|<=\s*\$?20|\$20/.test(text), gap: 'Price ≤ $20 / Lab Pro not clear enough' },
    { ok: /citation|bibtex/.test(text), gap: 'Citations / BibTeX missing from the paid story' },
    { ok: /sign-?off|signed off/.test(text), gap: 'Researcher sign-off not visible' },
    { ok: /console|plan\s*\/\s*act|plan → act/.test(text), gap: 'Agent console story too weak' },
    { ok: /attention|transformer|sandbox|prototype|toy/.test(text), gap: 'Runnable prototype outcome unclear' },
    {
      ok: media.includes('paid') || media.includes('sign') || media.includes('bibtex') || media.includes('console'),
      gap: 'Media set does not cover console / citations / sign-off / paid end',
    },
    {
      ok: input.mediaPaths.length >= 3,
      gap: 'Need ≥3 screenshots covering the paid journey',
    },
  ];

  const gaps = checks.filter((c) => !c.ok).map((c) => c.gap);
  // Iteration bonus for polish notes claiming UI upgrades after a prior NO
  const polish =
    input.iteration >= 2 && /polish|hero|pricing|receipt|meter|studio handoff|attention matrix/.test(text)
      ? 8
      : 0;
  const score = Math.min(100, Math.round(((checks.length - gaps.length) / checks.length) * 78 + polish + (gaps.length === 0 ? 12 : 0)));
  const verdict: PayJudgeVerdict = gaps.length === 0 && score >= 72 ? 'YES' : 'NO';

  return {
    verdict,
    score,
    why:
      verdict === 'YES'
        ? `Simulated common buyer: end-state shows Pro ≤ $${LAB_PRO_MAX_PRICE_USD}, console, citations, sign-off, and a concrete Transformer toy — worth a coffee-tier subscription.`
        : `Simulated common buyer: still missing trust signals (${gaps.slice(0, 2).join('; ') || 'weak packaging'}). Would not pay yet.`,
    gaps,
    improvements:
      verdict === 'YES'
        ? []
        : [
            'Make Lab Pro ≤ $20 badge impossible to miss on the paid end frame',
            'Show full console + BibTeX + signed-off receipt in the same viewport story',
            'Surface sandbox attention matrix as the tangible deliverable',
            ...gaps.map((g) => `Fix: ${g}`),
          ],
    model: 'simulated-heuristic',
    mode: 'simulated',
    iteration: input.iteration,
    criteria: [...PAY_JUDGE_CRITERIA],
  };
}

export async function runPayJudge(input: PayJudgeInput): Promise<PayJudgeResult> {
  if (keyFor('meta')) {
    const r = await museJudge(input);
    if (r.ok) return r.value;
    // Fall through to simulated with Muse error noted
    const sim = simulatePayJudge({
      ...input,
      notes: `${input.notes ?? ''}\n(Muse pay-judge unavailable: ${r.error})`.trim(),
    });
    return { ...sim, why: `${sim.why} [fallback after Muse error]` };
  }
  return simulatePayJudge(input);
}
