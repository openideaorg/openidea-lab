import { afterEach, describe, expect, it } from 'vitest';
import { runsPerBudget, summarise, type UsageEntry } from '@/lib/usage-types';
import { recordGpu, recordTokens, withUsage } from '@/lib/usage';

const saved = { ...process.env };
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
});

describe('summarise', () => {
  const tokens = (provider: 'meta' | 'fireworks', p: number, c: number, costUsd?: number): UsageEntry => ({
    kind: 'tokens', provider, model: 'm', label: 'plan', promptTokens: p, completionTokens: c, totalTokens: p + c, costUsd,
  });
  const meta = (p: number, c: number, costUsd?: number) => tokens('meta', p, c, costUsd);

  it('adds up tokens and calls per provider', () => {
    const s = summarise([meta(100, 50), meta(10, 5), tokens('fireworks', 1, 1)]);
    expect(s.meta).toMatchObject({ calls: 2, promptTokens: 110, completionTokens: 55, totalTokens: 165 });
    expect(s.fireworks).toMatchObject({ calls: 1, totalTokens: 2 });
    expect(s.baseten).toBeUndefined();
  });

  it('reports GPU seconds and warm-ups for Baseten', () => {
    const s = summarise([
      { kind: 'gpu', provider: 'baseten', model: 'x', label: 'segment', seconds: 40, warming: true },
      { kind: 'gpu', provider: 'baseten', model: 'x', label: 'segment', seconds: 2.5, warming: false },
    ]);
    expect(s.baseten).toMatchObject({ calls: 2, seconds: 42.5, warmups: 1 });
  });

  it('groups Baseten LLM fallback tokens separately from SAM GPU time', () => {
    const s = summarise([
      { kind: 'tokens', provider: 'baseten', model: 'spark-open', label: 'draft', promptTokens: 500, completionTokens: 100, totalTokens: 600, costUsd: 0.01 },
      { kind: 'gpu', provider: 'baseten', model: 'sam3', label: 'segment', seconds: 3, warming: false, costUsd: 0.02 },
    ]);
    expect(s.basetenLlm).toMatchObject({ calls: 1, totalTokens: 600 });
    expect(s.baseten).toMatchObject({ calls: 1, seconds: 3 });
    expect(s.costUsd).toBeCloseTo(0.03, 6);
  });
  it('shows a cost only when every entry is priced', () => {
    expect(summarise([meta(1, 1, 0.5), meta(1, 1, 0.25)]).costUsd).toBe(0.75);
    expect(summarise([meta(1, 1, 0.5), meta(1, 1)]).costUsd).toBeUndefined();
  });
});

describe('runsPerBudget', () => {
  it('floors the credit math and floors at one run', () => {
    expect(runsPerBudget(0.5, 20)).toBe(40);
    expect(runsPerBudget(30, 20)).toBe(1);
  });

  it('returns undefined when there is no honest number', () => {
    expect(runsPerBudget(undefined, 20)).toBeUndefined();
    expect(runsPerBudget(0, 20)).toBeUndefined();
  });
});

describe('recording', () => {
  it('collects entries from calls made anywhere inside withUsage', async () => {
    const { result, usage } = await withUsage(async () => {
      recordTokens('meta', 'muse', 'plan', { prompt_tokens: 100, completion_tokens: 40 });
      await Promise.resolve();
      recordTokens('fireworks', 'qwen', 'fix', { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 });
      recordGpu('sam3', 'segment', 3.2, false);
      return 'done';
    });
    expect(result).toBe('done');
    expect(usage.map((e) => `${e.provider}:${e.label}`)).toEqual(['meta:plan', 'fireworks:fix', 'baseten:segment']);
    expect(usage[0]).toMatchObject({ kind: 'tokens', totalTokens: 140 });
  });

  it('keeps concurrent requests apart', async () => {
    const run = (label: string) =>
      withUsage(async () => {
        await new Promise((r) => setTimeout(r, label === 'a' ? 10 : 1));
        recordTokens('meta', 'm', label, { prompt_tokens: 1, completion_tokens: 1 });
      });
    const [a, b] = await Promise.all([run('a'), run('b')]);
    expect(a.usage.map((e) => e.label)).toEqual(['a']);
    expect(b.usage.map((e) => e.label)).toEqual(['b']);
  });

  it('prices tokens per million when the env is set, and not otherwise', async () => {
    delete process.env.META_PRICE_IN_PER_M;
    delete process.env.META_PRICE_OUT_PER_M;
    const unpriced = await withUsage(async () => recordTokens('meta', 'm', 'plan', { prompt_tokens: 1_000_000, completion_tokens: 0 }));
    expect(unpriced.usage[0].costUsd).toBeUndefined();

    process.env.META_PRICE_IN_PER_M = '2';
    process.env.META_PRICE_OUT_PER_M = '10';
    const priced = await withUsage(async () => recordTokens('meta', 'm', 'plan', { prompt_tokens: 500_000, completion_tokens: 100_000 }));
    expect(priced.usage[0].costUsd).toBeCloseTo(2, 6); // 0.5M*$2 + 0.1M*$10
  });

  it('prices Baseten by the minute', async () => {
    process.env.BASETEN_PRICE_PER_MIN = '0.1';
    const { usage } = await withUsage(async () => recordGpu('sam3', 'segment', 30, false));
    expect(usage[0].costUsd).toBeCloseTo(0.05, 6);
  });

  it('does nothing outside withUsage', () => {
    expect(() => recordTokens('meta', 'm', 'x', { prompt_tokens: 1 })).not.toThrow();
  });
});
