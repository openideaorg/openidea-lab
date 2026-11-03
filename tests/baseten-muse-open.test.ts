import { afterEach, describe, expect, it } from 'vitest';
import { sparkOpenEndpoint, sparkOpenFallbackAllowed } from '@/lib/baseten-muse-open';

const saved = { ...process.env };
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
});

function keyed() {
  process.env.BASETEN_INFERENCE_API_KEY = 'k';
  process.env.BASETEN_INFERENCE_FALLBACK = '1';
}

describe('sparkOpenFallbackAllowed', () => {
  it('is off without an explicit opt-in, even with a key', () => {
    process.env.BASETEN_INFERENCE_API_KEY = 'k';
    delete process.env.BASETEN_INFERENCE_FALLBACK;
    expect(sparkOpenFallbackAllowed('draft')).toBe(false);
  });

  it('is off without a key, even with the opt-in', () => {
    delete process.env.BASETEN_INFERENCE_API_KEY;
    delete process.env.BASETEN_API_KEY;
    process.env.BASETEN_INFERENCE_FALLBACK = '1';
    expect(sparkOpenFallbackAllowed('draft')).toBe(false);
  });

  it('allows draft-family, fix and rank work when opted in', () => {
    keyed();
    for (const kind of ['draft', 'notebook', 'fix', 'rank']) {
      expect(sparkOpenFallbackAllowed(kind)).toBe(true);
    }
  });

  it('keeps plan/choose/verdict on Muse by default', () => {
    keyed();
    delete process.env.BASETEN_INFERENCE_ALLOW_VERDICT;
    for (const kind of ['plan', 'choose', 'verdict', 'parts', 'label']) {
      expect(sparkOpenFallbackAllowed(kind)).toBe(false);
    }
  });

  it('allows verdicts only with a second explicit opt-in', () => {
    keyed();
    process.env.BASETEN_INFERENCE_ALLOW_VERDICT = '1';
    expect(sparkOpenFallbackAllowed('verdict')).toBe(true);
  });
});

describe('sparkOpenEndpoint', () => {
  it('reads live env with repo defaults', () => {
    delete process.env.BASETEN_INFERENCE_API_URL;
    delete process.env.BASETEN_INFERENCE_MODEL;
    const { url, model } = sparkOpenEndpoint();
    expect(url).toContain('/chat/completions');
    expect(model).toContain('muse-spark-open');
  });
});
