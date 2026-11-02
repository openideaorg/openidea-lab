import { describe, expect, it } from 'vitest';
import { PAY_JUDGE_CRITERIA, simulatePayJudge } from '../lib/pay-judge';

describe('pay judge', () => {
  it('exposes buyer criteria', () => {
    expect(PAY_JUDGE_CRITERIA.length).toBeGreaterThanOrEqual(5);
  });

  it('says NO when media is thin', () => {
    const r = simulatePayJudge({
      iteration: 1,
      productSummary: 'A vague demo',
      buyerGets: ['something'],
      mediaPaths: ['a.png'],
    });
    expect(r.verdict).toBe('NO');
    expect(r.mode).toBe('simulated');
  });

  it('says YES for a complete Lab Pro Transformer end-state', () => {
    const r = simulatePayJudge({
      iteration: 2,
      productSummary:
        'Open Idea Lab Pro ≤ $20: Muse console plan/act/observe, Transformer attention toy, citations BibTeX, signed off, Studio handoff, attention matrix polish.',
      buyerGets: [
        'Lab Pro ≤ $20/mo',
        'Agent console plan / act / observe',
        'Citations + BibTeX',
        'Researcher sign-off',
        'Sandbox attention toy + Studio handoff',
      ],
      mediaPaths: [
        'media/paid-lab-demo/02-console-loop.png',
        'media/paid-lab-demo/05-pro-bibtex.png',
        'media/paid-lab-demo/06-paid-end.png',
      ],
      notes: 'polish pricing receipt meter studio handoff attention matrix',
    });
    expect(r.verdict).toBe('YES');
    expect(r.score).toBeGreaterThanOrEqual(72);
  });
});
