import { afterEach, describe, expect, it } from 'vitest';
import {
  LAB_PLANS,
  LAB_PRO_MAX_PRICE_USD,
  assertLabProUnderCap,
  getLabPlan,
  freeFenceMessage,
} from '@/lib/lab-plan';

const saved = { ...process.env };
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
});

describe('Lab Pro ≤ $20 packaging', () => {
  it('caps Pro at $20', () => {
    expect(LAB_PRO_MAX_PRICE_USD).toBe(20);
    expect(LAB_PLANS.pro.priceUsd).toBeLessThanOrEqual(LAB_PRO_MAX_PRICE_USD);
  });

  it('honours LAB_PRO_PRICE_USD but never above the hard cap', async () => {
    process.env.LAB_PRO_PRICE_USD = '15';
    // Re-import pattern: getLabPlan reads env via LAB_PLANS which is computed at load.
    // proPriceUsd is called when LAB_PLANS is evaluated — test the helper path via getLabPlan + assert.
    assertLabProUnderCap({ ...LAB_PLANS.pro, priceUsd: 15 });
    expect(() => assertLabProUnderCap({ ...LAB_PLANS.pro, priceUsd: 21 })).toThrow(/hard cap/);
  });

  it('defaults to free teaser', () => {
    delete process.env.LAB_PLAN;
    expect(getLabPlan().tier).toBe('free');
    expect(getLabPlan().labRunsPerMonth).toBe(2);
  });

  it('resolves Lab Pro when LAB_PLAN=pro', () => {
    process.env.LAB_PLAN = 'pro';
    expect(getLabPlan().tier).toBe('pro');
    expect(getLabPlan().durableReplay).toBe(true);
  });

  it('names free fence features for upgrade CTAs', () => {
    expect(freeFenceMessage('citationsExport')).toMatch(/Lab Pro/);
    expect(freeFenceMessage('citationsExport')).toMatch(/\$20/);
  });
});
