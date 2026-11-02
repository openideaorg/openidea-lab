import { afterEach, describe, expect, it } from 'vitest';
import { takeLabRunSlot } from '@/lib/agent/meter';

const saved = { ...process.env };
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
  const g = globalThis as unknown as { __labRunMeter?: Map<string, number> };
  g.__labRunMeter = new Map();
});

describe('Lab run meter', () => {
  it('allows free teaser runs then fences', async () => {
    const owner = `test-${Math.random().toString(36).slice(2)}`;
    const a = await takeLabRunSlot('free', owner);
    const b = await takeLabRunSlot('free', owner);
    const c = await takeLabRunSlot('free', owner);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.upgrade).toBe(true);
  });

  it('gives Lab Pro a larger allowance', async () => {
    const owner = `pro-${Math.random().toString(36).slice(2)}`;
    const first = await takeLabRunSlot('pro', owner);
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.limit).toBe(25);
  });
});
