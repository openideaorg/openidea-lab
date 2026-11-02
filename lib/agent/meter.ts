/**
 * Lab-run metering against Free / Lab Pro (≤ $20) allowances.
 *
 * Counts successful agent session starts per calendar month. Uses the same
 * Redis/memory pattern as budget.ts when available.
 */

import { getLabPlan, type LabPlanTier } from '../lab-plan';

const g = globalThis as unknown as { __labRunMeter?: Map<string, number> };

function monthKey(tier: LabPlanTier, owner = 'anon'): string {
  const d = new Date();
  return `lab:runs:${tier}:${owner}:${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
}

function redisCreds(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

async function readCount(key: string): Promise<number> {
  const map = (g.__labRunMeter ??= new Map());
  const redis = redisCreds();
  if (!redis) return map.get(key) ?? 0;
  try {
    const res = await fetch(`${redis.url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${redis.token}` },
      cache: 'no-store',
    });
    if (!res.ok) return map.get(key) ?? 0;
    const body = (await res.json()) as { result?: string | null };
    const n = body.result ? Number(body.result) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return map.get(key) ?? 0;
  }
}

async function incr(key: string): Promise<number> {
  const map = (g.__labRunMeter ??= new Map());
  const next = (map.get(key) ?? 0) + 1;
  map.set(key, next);
  const redis = redisCreds();
  if (!redis) return next;
  try {
    await fetch(`${redis.url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${redis.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['INCR', key],
        ['EXPIRE', key, String(60 * 60 * 24 * 40)],
      ]),
      cache: 'no-store',
    });
  } catch (e) {
    console.warn('[agent/meter] redis incr failed', e);
  }
  return next;
}

export type MeterDecision =
  | { ok: true; used: number; limit: number; tier: LabPlanTier }
  | { ok: false; error: string; used: number; limit: number; tier: LabPlanTier; upgrade?: true };

/** Check + consume one Lab run against the plan allowance. */
export async function takeLabRunSlot(tier: LabPlanTier = getLabPlan().tier, ownerId?: string): Promise<MeterDecision> {
  const plan = getLabPlan(tier);
  const key = monthKey(plan.tier, ownerId ?? 'anon');
  const used = await readCount(key);
  if (used >= plan.labRunsPerMonth) {
    return {
      ok: false,
      error:
        plan.tier === 'free'
          ? `Free teaser allows ${plan.labRunsPerMonth} Lab runs / month. Upgrade to Lab Pro (≤ $20/mo) for ${getLabPlan('pro').labRunsPerMonth} runs.`
          : `Lab Pro monthly run allowance (${plan.labRunsPerMonth}) used.`,
      used,
      limit: plan.labRunsPerMonth,
      tier: plan.tier,
      upgrade: plan.tier === 'free' ? true : undefined,
    };
  }
  const next = await incr(key);
  return { ok: true, used: next, limit: plan.labRunsPerMonth, tier: plan.tier };
}

export async function labRunUsage(tier: LabPlanTier = getLabPlan().tier, ownerId?: string) {
  const plan = getLabPlan(tier);
  const used = await readCount(monthKey(plan.tier, ownerId ?? 'anon'));
  return { used, limit: plan.labRunsPerMonth, tier: plan.tier, priceUsd: plan.priceUsd };
}
