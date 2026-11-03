import { describe, expect, it } from 'vitest';
import { checkPlan } from '@/lib/agent/verify/plan';
import { checkPrototype } from '@/lib/agent/verify/prototype';
import { checkClaimsShape } from '@/lib/agent/verify/claims';
import type { LabRun } from '@/lib/agent/types';

function baseRun(over: Partial<LabRun> = {}): LabRun {
  return {
    id: 't1',
    kind: 'idea',
    input: 'build a counter',
    planTier: 'pro',
    resources: [{ id: '1', type: 'code', title: 'x', url: 'https://example.com/x' }],
    files: [{ path: 'src/App.tsx', content: 'export default function App(){return null}' }],
    citations: [{ title: 'x', url: 'https://example.com/x' }],
    usage: [],
    status: 'running',
    turn: 1,
    messages: [],
    console: [],
    fixCount: 0,
    submitRefusals: 0,
    createdAt: 1,
    updatedAt: 1,
    plan: {
      summary: 'Ship a tiny counter',
      buildable: true,
      exists: ['React'],
      missing: ['backend'],
      steps: ['scaffold', 'run'],
    },
    sandbox: { ok: true, output: 'ok' },
    ...over,
  };
}

describe('agent verification gates', () => {
  it('refuses empty plans', () => {
    const r = checkPlan({ summary: '', buildable: true, exists: [], missing: [], steps: [] });
    expect(r.ok).toBe(false);
  });

  it('accepts a structural plan', () => {
    const r = checkPlan({
      summary: 'ok',
      buildable: true,
      exists: ['a'],
      missing: ['b'],
      steps: ['one', 'two'],
    });
    expect(r.ok).toBe(true);
  });

  it('refuses submit without citations from resources', () => {
    const r = checkPrototype(
      baseRun({ citations: [{ title: 'fake', url: 'https://evil.example/fake' }] }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.feedback).toMatch(/retrieved/);
  });

  it('requires paper verdict before submit', () => {
    const r = checkPrototype(baseRun({ kind: 'paper', verdict: undefined }));
    expect(r.ok).toBe(false);
  });

  it('refuses a paper submit whose sandbox never ran', () => {
    const r = checkPrototype(baseRun({ kind: 'paper', sandbox: undefined, verdict: undefined }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.feedback).toMatch(/passing sandbox run/);
  });

  it('refuses a paper submit with output but no CHECK line (toy print)', () => {
    const r = checkPrototype(
      baseRun({
        kind: 'paper',
        sandbox: { ok: true, output: 'attention weights:\n[[0.25 0.25] [0.25 0.25]]' },
        verdict: { verdict: 'partial', reason: 'It runs.' },
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.feedback).toMatch(/CHECK: pass/);
  });

  it('refuses a paper submit with CHECK but no null baseline', () => {
    const r = checkPrototype(
      baseRun({
        kind: 'paper',
        sandbox: { ok: true, output: 'CHECK: pass peak at n=d (err 0.21)' },
        verdict: { verdict: 'partial', reason: 'Peak is there.' },
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.feedback).toMatch(/baseline/);
  });

  it('refuses a paper submit with CHECK + baseline but no Scale line (sample-scale would read as the paper\'s number)', () => {
    const r = checkPrototype(
      baseRun({
        kind: 'paper',
        sandbox: { ok: true, output: 'CHECK: pass peak at n=d (test err 0.21±0.02 vs shuffled baseline 0.34±0.02)' },
        verdict: { verdict: 'matches', reason: 'Peak at the threshold, beats baseline.' },
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.feedback).toMatch(/Scale:/);
  });

  it('accepts a paper submit with CHECK + baseline + Scale + verdict', () => {
    const r = checkPrototype(
      baseRun({
        kind: 'paper',
        files: [
          { path: 'reproduce.py', content: 'print(1)' },
          { path: 'README.md', content: 'Claim: peak at n=d.\n\nScale: paper n=10k; this run n=30, 20 trials, ~3 s CPU. Cannot show the plateau.' },
        ],
        sandbox: {
          ok: true,
          output: 'CHECK: pass peak at n=d (test err 0.21±0.02 vs shuffled baseline 0.34±0.02)',
        },
        verdict: { verdict: 'matches', reason: 'Peak at the threshold, beats baseline.' },
      }),
    );
    expect(r.ok).toBe(true);
  });

  it('accepts the Scale line from the run itself when the draft step extracted it', () => {
    const r = checkPrototype(
      baseRun({
        kind: 'paper',
        scale: 'paper n=10k; this run n=30, ~3 s CPU.',
        sandbox: { ok: true, output: 'CHECK: pass peak at n=d (test err 0.21±0.02 vs shuffled baseline 0.34±0.02)' },
        verdict: { verdict: 'matches', reason: 'Peak at the threshold, beats baseline.' },
      }),
    );
    expect(r.ok).toBe(true);
  });

  it('accepts a well-formed Muse verdict', () => {
    const r = checkClaimsShape({ verdict: 'partial', reason: 'Peak is near the claim.' });
    expect(r.ok).toBe(true);
  });
});
