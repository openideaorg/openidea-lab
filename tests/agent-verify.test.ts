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

  it('accepts a well-formed Muse verdict', () => {
    const r = checkClaimsShape({ verdict: 'partial', reason: 'Peak is near the claim.' });
    expect(r.ok).toBe(true);
  });
});
