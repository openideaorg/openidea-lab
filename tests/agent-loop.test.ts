import { describe, expect, it, vi } from 'vitest';

// The route answers before the turns run, so a throw inside a turn must land on the saved run.
vi.mock('@/lib/muse-agent', () => ({
  chooseTool: async () => {
    throw new Error('muse exploded');
  },
}));

import { applyResume, createRun, getRun, runAgentInBackground } from '@/lib/agent/loop';
import { saveProgress } from '@/lib/agent/progress';

describe('agent loop background run', () => {
  it('marks a thrown turn as failed on the saved run', async () => {
    const run = createRun({ kind: 'idea', input: 'build a counter', planTier: 'free' });
    await saveProgress(run);
    await runAgentInBackground(run);
    const saved = await getRun(run.id);
    expect(saved?.status).toBe('failed');
    expect(saved?.stopReason).toMatch(/muse exploded/);
  });

  it('applyResume records the observation and saves without running a turn', async () => {
    const run = createRun({ kind: 'idea', input: 'build a counter', planTier: 'free' });
    run.status = 'needs_client';
    run.turn = 1;
    await saveProgress(run);
    const next = await applyResume(run.id, { sandbox: { ok: true, output: 'ran' } });
    expect(next.status).toBe('running');
    expect(next.sandbox?.ok).toBe(true);
    expect((await getRun(run.id))?.messages.at(-1)?.tool).toBe('run_sandbox');
    await expect(applyResume('nope-missing', {})).rejects.toThrow(/Unknown run/);
  });
});
